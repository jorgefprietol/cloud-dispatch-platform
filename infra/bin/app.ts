import { App, Tags } from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation';
import { RuntimeStack } from '../lib/runtime';
const app = new App();
const env = {account:process.env.CDK_DEFAULT_ACCOUNT,region:process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'};
const foundation = new FoundationStack(app,'CloudDispatchFoundation',{env});
if (app.node.tryGetContext('runtime') === 'true') {
  new RuntimeStack(app,'CloudDispatchRuntime',{env,foundation});
}
Tags.of(app).add('Project','cloud-dispatch'); Tags.of(app).add('ManagedBy','aws-cdk');
