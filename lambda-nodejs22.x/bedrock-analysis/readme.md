### bedrock-analysis

A Lambda function that leverages Amazon Bedrock to perform AI-powered business analysis, examining how various factors affect company performance. The function supports two operational modes: Knowledge Base-enhanced analysis and direct model invocation.

#### Detailed Operation

1. **Input Validation**
   - Validates required fields: companyName, affect, and bedrockRegion
   - Ensures AWS region format is valid using regex pattern `^[a-z]{2}-[a-z]+-\d{1}$`
   - Handles both direct Lambda invocation and API Gateway events

2. **Analysis Modes**

   a. **Knowledge Base Mode** (Primary)
   - Triggered when `knowledgeBaseId` is provided
   - Uses Claude 3 Sonnet (anthropic.claude-3-5-sonnet-20241022-v2:0)
   - Integrates with Amazon Bedrock Agent Runtime for enhanced context
   - Supports guardrails when `guardrailId` is provided
   - Includes citation tracking and token usage metrics
   - Returns comprehensive metadata about the analysis

   b. **Direct Invocation Mode** (Fallback)
   - Used when no `knowledgeBaseId` is provided
   - Directly calls Claude V2 (anthropic.claude-v2)
   - Simpler interaction without knowledge base context
   - Maintains consistent response format

#### Configuration Options

**Base Prompt Template**:
- Structures the analysis request consistently
- Formats output in markdown
- Includes four sections:
  1. Overview of relationship
  2. Key impacts
  3. Notable examples
  4. Overall effect summary

**Model Parameters**:
- Temperature: 0.7 (balanced creativity and consistency)
- Max tokens: 2048
- Includes token usage tracking
- Supports streaming metrics

#### Error Handling

- Comprehensive error catching and logging
- HTTP status code mapping:
  - 400: Invalid input parameters
  - 500: Internal processing errors
- Detailed error logging with AWS X-Ray integration
- Maintains consistent error response format

#### Sample Usage

1. **With Knowledge Base**:

```json
{
    "companyName": "Tesla",
    "affect": "semiconductor supply chain",
    "bedrockRegion": "us-east-1",
    "knowledgeBaseId": "KB_ID",
    "stockSymbol": "TSLA",
    "guardrailId": "OPTIONAL_GUARDRAIL_ID"
}
```

2. **Direct Model Access**:

```json
{
    "companyName": "Tesla",
    "affect": "semiconductor supply chain",
    "bedrockRegion": "us-east-1",
    "stockSymbol": "TSLA"
}
```

*Response Format*
```json
{
    "statusCode": 200,
    "headers": {
        "Content-Type": "application/json"
    },
    "body": {
        "message": "Markdown formatted analysis",
        "companyQueried": "Company name",
        "stockSymbol": "Stock symbol or null",
        "factorAnalyzed": "Analyzed factor",
        "retrievalMetadata": {
            "totalRetrieved": 0,
            "knowledgeBasesUsed": [],
            "bedrockRegion": "aws-region",
            "usedKnowledgeBase": true|false,
            "guardrailId": "guardrail-id or null",
            "citations": []
        }
    }
}
```

3. **Technical Details**:
#### Required IAM Permissions

```yaml
- Effect: Allow
  Action:
    - bedrock:InvokeModel
    - bedrock-agent-runtime:RetrieveAndGenerate
    - xray:PutTraceSegments
    - xray:PutTelemetryRecords
  Resource: "*"
```

**Dependencies**

```json
{
  "@aws-sdk/client-bedrock-runtime": "latest",
  "@aws-sdk/client-bedrock-agent-runtime": "latest",
  "aws-xray-sdk-core": "latest",
  "@aws-sdk/client-cloudwatch-logs": "latest"
}
```

**Monitoring and Debugging**
- Extensive console logging with DEBUGGING prefix
- X-Ray tracing integration for request tracking
- Token usage metrics tracking
- Citation tracking when using Knowledge Base
- Request metadata capture including timestamps and request IDs

**Best Practices**
- Always provide a valid AWS region
- Use Knowledge Base mode when possible for enhanced analysis
- Include stock symbol for more precise company identification
- Implement guardrails when content filtering is needed
- Monitor token usage for cost optimization