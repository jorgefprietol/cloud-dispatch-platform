import {test} from 'node:test';
import assert from 'node:assert/strict';
import {App} from 'aws-cdk-lib';
import {Template,Match} from 'aws-cdk-lib/assertions';
import {FoundationStack} from '../lib/foundation';
import {RuntimeStack} from '../lib/runtime';
test('production infrastructure isolates data, encrypts storage, and requires GitHub environment identity',()=>{
  const app=new App({context:{'@aws-cdk/aws-kms:defaultKeyPolicies':true,repository:'jorgefprietol/cloud-dispatch-platform',domain:'dispatch.example.com',zoneName:'example.com',zoneId:'Z000TEST',certificateArn:'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000',imageTag:'test'}});
  const env={account:'111111111111',region:'us-east-1'};const foundation=new FoundationStack(app,'Foundation',{env});
  const runtime=new RuntimeStack(app,'Runtime',{env,foundation});const template=Template.fromStack(runtime);
  template.hasResourceProperties('AWS::RDS::DBInstance',{PubliclyAccessible:false,MultiAZ:true,StorageEncrypted:true,DeletionProtection:true});
  template.hasResourceProperties('AWS::ElastiCache::ReplicationGroup',{TransitEncryptionEnabled:true,AtRestEncryptionEnabled:true,AutomaticFailoverEnabled:true});
  template.resourceCountIs('AWS::ECS::Service',3);template.resourceCountIs('AWS::SQS::Queue',4);
  template.hasResourceProperties('AWS::DynamoDB::Table',{PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true},BillingMode:'PAY_PER_REQUEST'});
  template.hasResourceProperties('AWS::S3::Bucket',{PublicAccessBlockConfiguration:{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true}});
  Template.fromStack(foundation).hasResourceProperties('AWS::IAM::Role',{AssumeRolePolicyDocument:{Statement:Match.arrayWith([Match.objectLike({Condition:{StringEquals:{'token.actions.githubusercontent.com:aud':'sts.amazonaws.com','token.actions.githubusercontent.com:sub':'repo:jorgefprietol/cloud-dispatch-platform:environment:production'}}})])}});
  assert.ok(Object.keys(template.toJSON().Resources).length > 60);
});
