### kb-sync

A Lambda function that initiates asynchronous synchronization of Amazon Bedrock Knowledge Base data sources. This function triggers ingestion jobs for all data sources associated with a specified Knowledge Base.

#### Detailed Operation

1. **Input Processing**
   - Requires a Knowledge Base ID (`knowledgeBaseId`) in the event payload
   - Validates the presence of required parameters
   - Generates and formats timestamps for tracking and response

2. **Synchronization Process**
   - Asynchronously initiates sync for all data sources
   - Uses AWS SDK v3 for Bedrock Agent operations
   - Implements non-blocking architecture for faster response
   - Logs sync initiation time for each data source

#### Key Features

- **Asynchronous Processing**: Initiates sync without waiting for completion
- **Multiple Data Source Support**: Handles multiple data sources per Knowledge Base
- **Timestamp Tracking**: Provides both formatted and ISO timestamps
- **Error Resilience**: Continues processing despite individual data source failures
- **Region Configurability**: Supports custom AWS region via environment variables

#### Sample Usage

```json
{
    "knowledgeBaseId": "D4KX42YDPN"
}
```
**Response Format**
```json
{
    "statusCode": 200,
    "body": {
        "message": "Knowledge Base sync initiated",
        "knowledgeBaseId": "D4KX42YDPN",
        "syncStartTime": "MM/DD/YYYY HH:MM:SS",
        "isoTimestamp": "YYYY-MM-DDTHH:MM:SS.sssZ"
    }
}
```

**Error Response**
```json
{
    "statusCode": 500,
    "body": {
        "message": "Error initiating Knowledge Base sync",
        "error": "Error message details"
    }
}
```

**Required IAM Permissions**
```yaml
- Effect: Allow
  Action:
    - bedrock:ListDataSources
    - bedrock:StartIngestionJob
  Resource: "*"

```

**Dependencies**
```json
{
  "@aws-sdk/client-bedrock-agent": "latest"
}
```
**Environment Variables**
AWS_REGION: AWS region for Bedrock operations (defaults to 'us-east-1')

**Monitoring and Logging**
- Console logging for sync initiation per data source
- Error logging for failed sync attempts
- Timestamp tracking for sync operations
- Individual data source sync status tracking

**Best Practices**
***Error Handling***
- Monitor CloudWatch logs for sync failures
- Implement retry mechanisms for failed syncs
- Track sync completion status separately

***Performance***
- Function timeout should account for listing data sources
- Consider implementing batch size limits for large Knowledge Bases
- Monitor concurrent sync jobs

***Operations***
- Regular monitoring of sync job status
- Implement alerting for failed sync jobs
- Track sync duration patterns

**Function Flow**
1. Receives event with Knowledge Base ID
2. Validates input parameters
3. Initializes Bedrock Agent client
4. Lists all data sources for the Knowledge Base
5. Initiates sync for each data source asynchronously
6. Returns immediate response with sync initiation details
7. Continues processing in background

**Limitations and Considerations**
- Function returns before sync completion
- Separate monitoring required for sync job status
- Region-specific service availability
- Service quotas for concurrent ingestion jobs