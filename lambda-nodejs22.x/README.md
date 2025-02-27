# AWS Lambda Functions for Data Processing and Analysis

This repository contains three AWS Lambda functions for data processing and analysis using Amazon Bedrock and S3 services.

## Functions

### [bedrock-analysis](./bedrock-analysis/)
Performs AI-powered business analysis using Amazon Bedrock, examining how various factors affect company performance. Supports both Knowledge Base-enhanced analysis and direct model invocation using Claude models.

### [kb-sync](./kb-sync/)
Manages synchronization of Amazon Bedrock Knowledge Base data sources by initiating asynchronous ingestion jobs. Handles multiple data sources and provides timestamp tracking for sync operations.

### [s3unzip](./s3unzip/)
Processes compressed files (.zip, .gz, and .tar.gz) in S3 buckets with support for cross-region operations and large file handling through multipart uploads.

## Configuration

The `template.yml` defines the following for each function:

- **BedrockAnalysisFunction**
  - Runtime: Node.js 18.x
  - Memory: 256MB
  - Timeout: 60 seconds
  - API Gateway endpoint: POST /analyze
  - Permissions: Bedrock model invocation, CloudWatch logs access

- **KBSync**
  - Runtime: Node.js 20.x
  - Memory: Default
  - Timeout: 30 seconds
  - API Gateway endpoint: POST /sync
  - Permissions: S3 read access, Bedrock Knowledge Base operations

- **S3unzipFunction**
  - Runtime: Node.js 20.x
  - Memory: 1024MB
  - Timeout: 300 seconds (5 minutes)
  - API Gateway endpoint: POST /s3unzip
  - Permissions: Full S3 read/write access

## Deployment

### Prerequisites
- AWS SAM CLI installed
- AWS credentials configured
- Node.js 18.x or later

### Build and Deploy

1. **Build the application**
```bash
sam build
sam deploy --force-upload
```

2. **Deploy to AWS First time deployment**
```bash
sam deploy --guided
```

**Testing Individual Functions
```bash
sam build FunctionName
```
Example: sam build BedrockAnalysisFunction

### API Authentication ###
All API endpoints require an API key for access, configured globally in the template.yml
```yaml
Globals:
  Api:
    Auth:
      ApiKeyRequired: true
```

## Environment Variables

The following environment variables are configured in the template:

### BedrockAnalysisFunction
- AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: "1"
- AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1"
- AWS_SDK_JS_DEBUG: "true"
- NODE_OPTIONS: "--enable-source-maps"

### KBSync
- AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: "1"
- AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1"

### S3unzipFunction
No specific environment variables required

## Monitoring

- All functions include AWS X-Ray tracing
- CloudWatch logs are automatically configured
- API Gateway metrics available for endpoint monitoring

## Security

- Functions use least-privilege permissions
- API endpoints require API keys
- Cross-region operations supported where applicable
- S3 operations use secure transfer protocols

For detailed documentation on each function, please refer to their respective directories.
