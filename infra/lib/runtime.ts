import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { FoundationStack } from './foundation';
export class RuntimeStack extends Stack {
  constructor(scope:Construct,id:string,props:StackProps & {foundation:FoundationStack}) {
    super(scope,id,props);
    const required = (name:string) => {const value=this.node.tryGetContext(name);if(!value)throw new Error(`Missing CDK context: ${name}`);return value as string;};
    const domain=required('domain'), certificateArn=required('certificateArn'), zoneId=required('zoneId'), imageTag=required('imageTag');
    const zoneName=required('zoneName');
    const f=props.foundation, key=f.key;
    const vpc=new ec2.Vpc(this,'Vpc',{maxAzs:2,natGateways:2,subnetConfiguration:[
      {name:'edge',subnetType:ec2.SubnetType.PUBLIC}, {name:'application',subnetType:ec2.SubnetType.PRIVATE_WITH_EGRESS}, {name:'data',subnetType:ec2.SubnetType.PRIVATE_ISOLATED}
    ]});
    vpc.addGatewayEndpoint('S3Endpoint',{service:ec2.GatewayVpcEndpointAwsService.S3});
    const cluster=new ecs.Cluster(this,'Cluster',{vpc,defaultCloudMapNamespace:{name:'dispatch.local'},containerInsightsV2:ecs.ContainerInsights.ENABLED});
    const apiGroup=new ec2.SecurityGroup(this,'ApiGroup',{vpc});
    const workerGroup=new ec2.SecurityGroup(this,'WorkerGroup',{vpc});
    const webGroup=new ec2.SecurityGroup(this,'WebGroup',{vpc});
    apiGroup.addIngressRule(webGroup,ec2.Port.tcp(8080));apiGroup.addIngressRule(workerGroup,ec2.Port.tcp(8080));
    const database=new rds.DatabaseInstance(this,'Database',{vpc,vpcSubnets:{subnetType:ec2.SubnetType.PRIVATE_ISOLATED},
      engine:rds.DatabaseInstanceEngine.postgres({version:rds.PostgresEngineVersion.VER_17}),databaseName:'dispatch',credentials:rds.Credentials.fromGeneratedSecret('dispatch',{encryptionKey:key}),
      instanceType:ec2.InstanceType.of(ec2.InstanceClass.T4G,ec2.InstanceSize.MICRO),multiAz:true,allocatedStorage:20,maxAllocatedStorage:100,
      storageEncrypted:true,storageEncryptionKey:key,backupRetention:Duration.days(7),deletionProtection:true,removalPolicy:RemovalPolicy.RETAIN,
      publiclyAccessible:false,cloudwatchLogsExports:['postgresql'],autoMinorVersionUpgrade:true
    });
    database.connections.allowDefaultPortFrom(apiGroup);
    const redisSecret=new secrets.Secret(this,'RedisSecret',{encryptionKey:key,generateSecretString:{passwordLength:40,excludePunctuation:true}});
    const cacheGroup=new ec2.SecurityGroup(this,'CacheGroup',{vpc});cacheGroup.addIngressRule(apiGroup,ec2.Port.tcp(6379));
    const cacheSubnets=new elasticache.CfnSubnetGroup(this,'CacheSubnets',{description:'Isolated cache subnets',subnetIds:vpc.isolatedSubnets.map(s=>s.subnetId)});
    const cache=new elasticache.CfnReplicationGroup(this,'Cache',{replicationGroupDescription:'Cloud Dispatch dashboard cache',engine:'redis',engineVersion:'7.1',cacheNodeType:'cache.t4g.micro',
      numCacheClusters:2,automaticFailoverEnabled:true,multiAzEnabled:true,atRestEncryptionEnabled:true,transitEncryptionEnabled:true,kmsKeyId:key.keyArn,
      authToken:redisSecret.secretValue.unsafeUnwrap(),cacheSubnetGroupName:cacheSubnets.ref,securityGroupIds:[cacheGroup.securityGroupId]
    });
    const reports=new s3.Bucket(this,'Reports',{encryption:s3.BucketEncryption.KMS,encryptionKey:key,blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,enforceSSL:true,versioned:true,
      removalPolicy:RemovalPolicy.RETAIN,lifecycleRules:[{noncurrentVersionExpiration:Duration.days(90),abortIncompleteMultipartUploadAfter:Duration.days(1)}]});
    const dlq=new sqs.Queue(this,'DeadLetters',{encryption:sqs.QueueEncryption.KMS,encryptionMasterKey:key,retentionPeriod:Duration.days(14),enforceSSL:true});
    const queue=new sqs.Queue(this,'DispatchQueue',{encryption:sqs.QueueEncryption.KMS,encryptionMasterKey:key,visibilityTimeout:Duration.seconds(120),retentionPeriod:Duration.days(4),deadLetterQueue:{queue:dlq,maxReceiveCount:5},enforceSSL:true});
    const completions=new sns.Topic(this,'Completions',{masterKey:key});
    const archiveDlq=new sqs.Queue(this,'AuditDeadLetters',{encryption:sqs.QueueEncryption.KMS,encryptionMasterKey:key,retentionPeriod:Duration.days(14),enforceSSL:true});
    const archive=new sqs.Queue(this,'CompletionArchive',{encryption:sqs.QueueEncryption.KMS,encryptionMasterKey:key,retentionPeriod:Duration.days(14),visibilityTimeout:Duration.seconds(180),deadLetterQueue:{queue:archiveDlq,maxReceiveCount:5},enforceSSL:true});
    completions.addSubscription(new subscriptions.SqsSubscription(archive,{rawMessageDelivery:true}));
    const auditTable=new dynamodb.Table(this,'AuditTable',{partitionKey:{name:'pk',type:dynamodb.AttributeType.STRING},sortKey:{name:'sk',type:dynamodb.AttributeType.STRING},billingMode:dynamodb.BillingMode.PAY_PER_REQUEST,encryption:dynamodb.TableEncryption.CUSTOMER_MANAGED,encryptionKey:key,pointInTimeRecoverySpecification:{pointInTimeRecoveryEnabled:true},timeToLiveAttribute:'expiresAt',removalPolicy:RemovalPolicy.RETAIN});
    const auditFunction=new lambda.DockerImageFunction(this,'AuditFunction',{code:lambda.DockerImageCode.fromEcr(f.repositories.audit,{tagOrDigest:imageTag}),timeout:Duration.seconds(30),memorySize:512,environment:{AUDIT_TABLE:auditTable.tableName},loggingFormat:lambda.LoggingFormat.JSON});
    auditFunction.addEventSource(new sources.SqsEventSource(archive,{batchSize:10,reportBatchItemFailures:true}));auditTable.grantWriteData(auditFunction);
    key.grantEncryptDecrypt(new ServicePrincipal('sns.amazonaws.com'));
    const workerSecret=new secrets.Secret(this,'WorkerSecret',{encryptionKey:key,generateSecretString:{passwordLength:48,excludePunctuation:true}});
    const users=new cognito.UserPool(this,'Users',{selfSignUpEnabled:false,signInAliases:{email:true},mfa:cognito.Mfa.REQUIRED,mfaSecondFactor:{otp:true,sms:false},
      passwordPolicy:{minLength:14,requireDigits:true,requireLowercase:true,requireUppercase:true,requireSymbols:true},removalPolicy:RemovalPolicy.RETAIN});
    const client=users.addClient('ConsoleClient',{generateSecret:false,preventUserExistenceErrors:true,oAuth:{flows:{authorizationCodeGrant:true},scopes:[cognito.OAuthScope.OPENID,cognito.OAuthScope.EMAIL,cognito.OAuthScope.PROFILE],callbackUrls:[`https://${domain}/auth/callback`]},supportedIdentityProviders:[cognito.UserPoolClientIdentityProvider.COGNITO]});
    users.addDomain('LoginDomain',{cognitoDomain:{domainPrefix:`cloud-dispatch-${this.account}-${this.region}`}});
    const createService=(name:string,group:ec2.SecurityGroup,environment:Record<string,string>,taskSecrets:Record<string,ecs.Secret>,memory:number,desired:number) => {
      const task=new ecs.FargateTaskDefinition(this,`${name}Task`,{cpu:512,memoryLimitMiB:memory});
      const logGroup=new logs.LogGroup(this,`${name}Logs`,{retention:logs.RetentionDays.ONE_MONTH,removalPolicy:RemovalPolicy.RETAIN});
      const container=task.addContainer(name,{image:ecs.ContainerImage.fromEcrRepository(f.repositories[name],imageTag),logging:ecs.LogDrivers.awsLogs({streamPrefix:name,logGroup}),environment,secrets:taskSecrets,readonlyRootFilesystem:false});
      if(name!=='worker')container.addPortMappings({containerPort:8080});
      const service=new ecs.FargateService(this,`${name}Service`,{cluster,taskDefinition:task,desiredCount:desired,securityGroups:[group],vpcSubnets:{subnetType:ec2.SubnetType.PRIVATE_WITH_EGRESS},assignPublicIp:false,
        circuitBreaker:{rollback:true},enableExecuteCommand:false,cloudMapOptions:name==='api'?{name:'orders-api'}:undefined,healthCheckGracePeriod:name==='web'?Duration.seconds(60):undefined});
      service.node.addDependency(database,cache);
      const scaling=service.autoScaleTaskCount({minCapacity:desired,maxCapacity:6});scaling.scaleOnCpuUtilization('CpuScaling',{targetUtilizationPercent:60,scaleInCooldown:Duration.minutes(3),scaleOutCooldown:Duration.seconds(60)});
      return {service,task};
    };
    const api=createService('api',apiGroup,{ASPNETCORE_ENVIRONMENT:'Production',Database__Host:database.dbInstanceEndpointAddress,Database__RootCertificate:'/app/rds-ca-bundle.pem',Redis__Host:cache.attrPrimaryEndPointAddress,AWS__Region:this.region,AWS__QueueUrl:queue.queueUrl,AWS__Bucket:reports.bucketName,Auth__Authority:`https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`,Auth__Audience:client.userPoolClientId},
      {Database__Password:ecs.Secret.fromSecretsManager(database.secret!,'password'),Redis__Password:ecs.Secret.fromSecretsManager(redisSecret),Worker__Secret:ecs.Secret.fromSecretsManager(workerSecret)},1024,2);
    queue.grantSendMessages(api.task.taskRole);reports.grantRead(api.task.taskRole,'dispatch/*');
    const worker=createService('worker',workerGroup,{AWS_REGION:this.region,QUEUE_URL:queue.queueUrl,REPORT_BUCKET:reports.bucketName,ORDERS_API_URL:'http://orders-api.dispatch.local:8080',NOTIFICATION_TOPIC_ARN:completions.topicArn},
      {WORKER_SECRET:ecs.Secret.fromSecretsManager(workerSecret)},1024,2);
    queue.grantConsumeMessages(worker.task.taskRole);reports.grantPut(worker.task.taskRole,'dispatch/*');completions.grantPublish(worker.task.taskRole);
    const web=createService('web',webGroup,{API_UPSTREAM:'orders-api.dispatch.local:8080',AUTH_MODE:'cognito',OIDC_AUTHORITY:`https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`,OIDC_CLIENT_ID:client.userPoolClientId,OIDC_REDIRECT_URI:`https://${domain}/auth/callback`},{},1024,2);
    const balancer=new elb.ApplicationLoadBalancer(this,'LoadBalancer',{vpc,internetFacing:true,dropInvalidHeaderFields:true});
    balancer.addListener('Http',{port:80,defaultAction:elb.ListenerAction.redirect({protocol:'HTTPS',port:'443',permanent:true})});
    const listener=balancer.addListener('Https',{port:443,certificates:[acm.Certificate.fromCertificateArn(this,'Certificate',certificateArn)],sslPolicy:elb.SslPolicy.RECOMMENDED_TLS});
    listener.addTargets('Console',{port:8080,targets:[web.service],healthCheck:{path:'/health/ready',healthyHttpCodes:'200',interval:Duration.seconds(30)},deregistrationDelay:Duration.seconds(30)});
    const zone=route53.HostedZone.fromHostedZoneAttributes(this,'Dns',{hostedZoneId:zoneId,zoneName});new route53.ARecord(this,'AppRecord',{zone,recordName:domain,target:route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(balancer))});
    const firewall=new waf.CfnWebACL(this,'Firewall',{scope:'REGIONAL',defaultAction:{allow:{}},visibilityConfig:{cloudWatchMetricsEnabled:true,sampledRequestsEnabled:true,metricName:'CloudDispatchWaf'},rules:[
      {name:'CommonThreats',priority:0,overrideAction:{none:{}},statement:{managedRuleGroupStatement:{vendorName:'AWS',name:'AWSManagedRulesCommonRuleSet'}},visibilityConfig:{cloudWatchMetricsEnabled:true,sampledRequestsEnabled:true,metricName:'CommonThreats'}},
      {name:'RateLimit',priority:1,action:{block:{}},statement:{rateBasedStatement:{limit:1000,aggregateKeyType:'IP'}},visibilityConfig:{cloudWatchMetricsEnabled:true,sampledRequestsEnabled:true,metricName:'RateLimit'}}
    ]});new waf.CfnWebACLAssociation(this,'FirewallAssociation',{resourceArn:balancer.loadBalancerArn,webAclArn:firewall.attrArn});
    const auditBucket=new s3.Bucket(this,'AuditBucket',{encryption:s3.BucketEncryption.S3_MANAGED,blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,enforceSSL:true,versioned:true,removalPolicy:RemovalPolicy.RETAIN});
    const trail=new cloudtrail.Trail(this,'AuditTrail',{bucket:auditBucket,isMultiRegionTrail:true,includeGlobalServiceEvents:true,sendToCloudWatchLogs:true,cloudWatchLogsRetention:logs.RetentionDays.ONE_MONTH});trail.addS3EventSelector([{bucket:reports,objectPrefix:'dispatch/'}],{readWriteType:cloudtrail.ReadWriteType.WRITE_ONLY});
    const vault=new backup.BackupVault(this,'BackupVault',{encryptionKey:key,removalPolicy:RemovalPolicy.RETAIN});
    const plan=new backup.BackupPlan(this,'BackupPlan',{backupVault:vault});plan.addRule(backup.BackupPlanRule.daily());plan.addSelection('DatabaseBackup',{resources:[backup.BackupResource.fromRdsDatabaseInstance(database)]});
    const alarms=new sns.Topic(this,'OperationalAlerts',{masterKey:key});const email=this.node.tryGetContext('alertEmail');if(email)alarms.addSubscription(new subscriptions.EmailSubscription(email));
    for(const [name,metric,threshold] of [
      ['DeadLetters',dlq.metricApproximateNumberOfMessagesVisible(),1],['AuditDeadLetters',archiveDlq.metricApproximateNumberOfMessagesVisible(),1],['QueueAge',queue.metricApproximateAgeOfOldestMessage(),120],
      ['ServerErrors',balancer.metrics.httpCodeTarget(elb.HttpCodeTarget.TARGET_5XX_COUNT,{period:Duration.minutes(1)}),5],
      ['DatabaseStorage',database.metricFreeStorageSpace(),5*1024*1024*1024]
    ] as const){const alarm=new cloudwatch.Alarm(this,`${name}Alarm`,{metric,threshold,evaluationPeriods:2,treatMissingData:cloudwatch.TreatMissingData.NOT_BREACHING,comparisonOperator:name==='DatabaseStorage'?cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD:cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD});alarm.addAlarmAction(new actions.SnsAction(alarms));}
    if(email)new budgets.CfnBudget(this,'MonthlyBudget',{budget:{budgetName:'cloud-dispatch-monthly',budgetType:'COST',timeUnit:'MONTHLY',budgetLimit:{amount:100,unit:'USD'}},notificationsWithSubscribers:[{notification:{comparisonOperator:'GREATER_THAN',notificationType:'ACTUAL',threshold:80,thresholdType:'PERCENTAGE'},subscribers:[{subscriptionType:'EMAIL',address:email}]}]});
    new CfnOutput(this,'ApplicationUrl',{value:`https://${domain}`});new CfnOutput(this,'UserPoolId',{value:users.userPoolId});new CfnOutput(this,'UserPoolClientId',{value:client.userPoolClientId});new CfnOutput(this,'QueueUrl',{value:queue.queueUrl});new CfnOutput(this,'DeadLetterQueueUrl',{value:dlq.queueUrl});new CfnOutput(this,'ReportsBucket',{value:reports.bucketName});new CfnOutput(this,'AuditTableName',{value:auditTable.tableName});
  }
}
