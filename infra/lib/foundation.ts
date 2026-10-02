import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
export class FoundationStack extends Stack {
  readonly repositories: Record<string,ecr.Repository> = {};
  readonly key:kms.Key;
  constructor(scope:Construct,id:string,props:StackProps) {
    super(scope,id,props);
    this.key = new kms.Key(this,'EncryptionKey',{enableKeyRotation:true,removalPolicy:RemovalPolicy.RETAIN,alias:'alias/cloud-dispatch'});
    for (const service of ['api','worker','web','audit']) this.repositories[service] = new ecr.Repository(this,`${service}Repository`,{
      repositoryName:`cloud-dispatch-${service}`,imageScanOnPush:true,imageTagMutability:ecr.TagMutability.IMMUTABLE,
      encryption:ecr.RepositoryEncryption.KMS,encryptionKey:this.key,removalPolicy:RemovalPolicy.RETAIN,
      lifecycleRules:[{maxImageCount:30,description:'Keep the latest 30 artifacts'}]
    });
    const existing = this.node.tryGetContext('oidcProviderArn');
    let provider:iam.IOpenIdConnectProvider;
    if(existing) provider=iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this,'GitHubProvider',existing);
    else {
      const resource=new iam.CfnOIDCProvider(this,'GitHubOidc',{url:'https://token.actions.githubusercontent.com',clientIdList:['sts.amazonaws.com']});
      resource.applyRemovalPolicy(RemovalPolicy.RETAIN);
      provider=iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this,'GitHubProvider',resource.attrArn);
    }
    const repo = this.node.tryGetContext('repository');
    const deploy = new iam.Role(this,'GitHubDeploymentRole',{roleName:'cloud-dispatch-github-deploy',maxSessionDuration:Duration.hours(1),assumedBy:new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn,{
      StringEquals:{'token.actions.githubusercontent.com:aud':'sts.amazonaws.com','token.actions.githubusercontent.com:sub':`repo:${repo}:environment:production`}
    })});
    deploy.addToPolicy(new iam.PolicyStatement({actions:['sts:AssumeRole'],resources:[`arn:${this.partition}:iam::${this.account}:role/cdk-*-deploy-role-${this.account}-${this.region}`,`arn:${this.partition}:iam::${this.account}:role/cdk-*-file-publishing-role-${this.account}-${this.region}`,`arn:${this.partition}:iam::${this.account}:role/cdk-*-lookup-role-${this.account}-${this.region}`]}));
    deploy.addToPolicy(new iam.PolicyStatement({actions:['cloudformation:DescribeStacks','cloudformation:DescribeStackEvents','cloudformation:GetTemplate'],resources:[`arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/CloudDispatch*/*`]}));
    deploy.addToPolicy(new iam.PolicyStatement({actions:['ssm:GetParameter'],resources:[`arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*/version`]}));
    deploy.addToPolicy(new iam.PolicyStatement({actions:['ecr:GetAuthorizationToken'],resources:['*']}));
    for(const repository of Object.values(this.repositories)) repository.grantPullPush(deploy);
    new CfnOutput(this,'DeploymentRoleArn',{value:deploy.roleArn});
    new CfnOutput(this,'OidcProviderArn',{value:provider.openIdConnectProviderArn});
  }
}
