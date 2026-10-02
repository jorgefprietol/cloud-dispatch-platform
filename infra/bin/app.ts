import { App, Tags } from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation';
import { RuntimeStack } from '../lib/runtime';
const app = new App();
const offline=app.node.tryGetContext('offline')==='true';
const env = {account:offline?'111111111111':process.env.CDK_DEFAULT_ACCOUNT,region:offline?'us-east-1':process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'};
if(offline)app.node.setContext('availability-zones:account=111111111111:region=us-east-1',['us-east-1a','us-east-1b']);
const foundation = new FoundationStack(app,'CloudDispatchFoundation',{env});
if (app.node.tryGetContext('runtime') === 'true') {
  new RuntimeStack(app,'CloudDispatchRuntime',{env,foundation});
}
Tags.of(app).add('Project','cloud-dispatch'); Tags.of(app).add('ManagedBy','aws-cdk');
