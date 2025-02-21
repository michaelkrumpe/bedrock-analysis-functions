Bedrock Analysis Lambda Function

Overview
This Lambda function provides an interface to analyze how various factors affect company performance using Amazon Bedrock's knowledge bases and foundation models. It can be invoked directly through AWS services or via API Gateway, offering flexibility in integration methods.

Purpose
The function is designed to generate analytical insights about how specific factors (such as seasonal demand, competition, or economic indicators) impact a company's business performance. It leverages Amazon Bedrock's capabilities to provide data-driven analysis when knowledge bases are available, or general industry analysis when they're not.

Requirements

AWS Lambda with Node.js 20.x runtime

Amazon Bedrock access

Appropriate IAM permissions for Bedrock operations

Optional: API Gateway for HTTP endpoint access

Optional: Amazon Bedrock Knowledge Bases with relevant company data

Function Parameters

Required Parameters

companyName (string): Name of the company to analyze

Example: "Amazon"

Used in: Query construction and analysis context

affect (string): The factor or condition to analyze

Example: "seasonal demand", "market competition"

Used in: Query construction and analysis focus

bedrockRegion (string): AWS region for Bedrock operations

Format: aws-region format (e.g., "us-east-1")

Used in: Bedrock client initialization

Optional Parameters

knowledgeBaseIds (array of strings): Knowledge Base IDs to query

Example: "kb1_identifier", "kb2_identifier"

Effect: Enables data-driven analysis when provided

Default: If not provided, uses general industry knowledge

stockSymbol (string): Company's stock market symbol

Example: "AMZN"

Effect: Adds precision to company identification

Default: None

Usage Examples

Direct Lambda Invocation:
const payload = {
"companyName": "Amazon",
"stockSymbol": "AMZN",
"affect": "seasonal demand",
"knowledgeBaseIds": "kb1_identifier", "kb2_identifier",
"bedrockRegion": "us-east-1"
}

API Gateway POST Request:
{
"companyName": "Amazon",
"affect": "seasonal demand",
"bedrockRegion": "us-east-1"
}

Minimal Request:
{
"companyName": "Amazon",
"affect": "market competition",
"bedrockRegion": "us-east-1"
}

Prompt Generation Logic

The function uses a base prompt template that's enhanced based on the provided parameters:

Base Template Structure:
You are a business analyst examining how external factors affect company performance.

Based on the retrieved information, provide an analysis of how affect impacts companyIdentifier's business performance and operations.

Please structure your response as follows:

Brief overview of the relationship between affect and companyIdentifier

Key impacts identified from the data

Notable examples or specific instances (if available)

Summary of the overall effect

Prompt Variations

With Knowledge Bases

Adds: "Focus on factual information from the provided data sources."

Uses retrieved data for analysis

More specific and data-driven insights

Without Knowledge Bases

Adds: "Base your analysis on general business principles and industry knowledge."

Relies on model's general knowledge

Broader industry-based analysis

With Stock Symbol

Company identifier format: "CompanyName (SYMBOL)"

Provides more precise company identification

Helps distinguish between similarly named companies

Response Format

Success Response:
{
"message": "Generated analysis text",
"companyQueried": "Amazon",
"stockSymbol": "AMZN",
"factorAnalyzed": "seasonal demand",
"retrievalMetadata": {
"totalRetrieved": 3,
"knowledgeBasesUsed": "kb1_identifier",
"bedrockRegion": "us-east-1",
"usedKnowledgeBases": true
}
}

Error Response:
{
"message": "Error processing request",
"error": "Error description"
}

Key Features

Flexible Invocation

Supports both direct Lambda invocation and API Gateway

Automatically detects invocation method

Returns appropriate response format

Dynamic Analysis Approach

Uses knowledge bases when available for data-driven analysis

Falls back to general analysis when no knowledge bases provided

Maintains consistent response structure

Enhanced Company Identification

Optional stock symbol support

Improves accuracy of company identification

Useful for companies with similar names

Robust Error Handling

Input validation for required parameters

Region format validation

Detailed error messages

Comprehensive Metadata

Tracks knowledge base usage

Records retrieval statistics

Provides transparency in analysis source

Best Practices

Knowledge Base Usage

Provide knowledge bases when specific company data is needed

Use multiple knowledge bases for broader context

Ensure knowledge bases contain relevant, up-to-date information

Query Construction

Be specific with the affect parameter

Include stock symbol for public companies

Use clear, unambiguous company names

Region Selection

Use the region where your knowledge bases are located

Consider latency when selecting regions

Ensure Bedrock service availability in chosen region

Limitations

Maximum response size limited by Lambda and API Gateway

Knowledge base retrieval limited to 3 results per knowledge base

Region must be where Bedrock service is available

Response time may vary based on analysis complexity

Error Handling
The function handles various error scenarios:

Missing required parameters

Invalid region format

Invalid knowledge base array format

Bedrock service errors

General runtime errors

Security Considerations

Requires appropriate IAM permissions

Region validation prevents invalid endpoints

No sensitive data in error messages

Logs structured for monitoring