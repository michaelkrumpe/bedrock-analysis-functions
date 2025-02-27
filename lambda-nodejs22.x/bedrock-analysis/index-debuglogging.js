'use strict';

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = require("@aws-sdk/client-bedrock-agent-runtime");
const AWSXRay = require('aws-xray-sdk-core');
const { CloudWatchLogsClient, StartQueryCommand, GetLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");

const getTokenUsageForRequest = async (timestamp, functionArn, region) => {
    const cloudWatchClient = new CloudWatchLogsClient({ region });
    
    // Add a delay to ensure both logs are written
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const requestTime = new Date(timestamp);
    const startTime = requestTime.getTime() - 120 * 1000;
    const endTime = requestTime.getTime() + 120 * 1000;

    console.log('Searching for logs between:', {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString()
    });

    // Fixed query syntax for CloudWatch Logs Insights
    const queryString = [
        'fields @timestamp, @message',
        'filter @logStream like /aws/bedrock/modelinvocations',
        'filter operation in ["InvokeModel", "Converse"]',
        'sort @timestamp asc',
        'limit 50'
    ].join('\n');

    try {
        // Start the query
        const startQueryCommand = new StartQueryCommand({
            logGroupName: 'BedrockToCloudwatchLogGroup',
            startTime: Math.floor(startTime / 1000),
            endTime: Math.floor(endTime / 1000),
            queryString: queryString
        });

        const startQueryResponse = await cloudWatchClient.send(startQueryCommand);
        const queryId = startQueryResponse.queryId;

        console.log('Started query:', queryId);

        // Wait for results
        const getQueryResultsCommand = new GetQueryResultsCommand({
            queryId: queryId
        });

        let results;
        for (let attempts = 0; attempts < 10; attempts++) {
            const resultsResponse = await cloudWatchClient.send(getQueryResultsCommand);
            
            if (resultsResponse.status === 'Complete') {
                results = resultsResponse.results;
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (results && results.length > 0) {
            console.log(`Found ${results.length} log entries`);
            
            // Process each result
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                try {
                    const messageField = result.find(f => f.field === '@message');
                    if (!messageField) {
                        console.log('No @message field found in result');
                        continue;
                    }

                    const message = JSON.parse(messageField.value);
                    
                    console.log('\nExamining log entry:', {
                        timestamp: new Date(message.timestamp).toISOString(),
                        operation: message.operation
                    });

                    if (message.operation === "Converse" && 
                        message.output?.outputBodyJson?.usage) {
                        
                        const usage = message.output.outputBodyJson.usage;
                        console.log('Found token usage:', usage);
                        
                        return {
                            inputTokens: usage.inputTokens,
                            outputTokens: usage.outputTokens,
                            totalTokens: usage.totalTokens
                        };
                    }
                } catch (parseError) {
                    console.log('Error parsing result:', {
                        error: parseError.message,
                        result: result
                    });
                }
            }
            
            console.log('No matching Converse operation found with token usage');
        } else {
            console.log('No results found');
        }

        return null;
    } catch (error) {
        console.error('Error querying CloudWatch:', {
            name: error.name,
            message: error.message,
            code: error.$metadata?.httpStatusCode
        });
        throw error;
    }
};



const isValidAwsRegion = (region) => {
    const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
    return regionRegex.test(region);
};

const BASE_PROMPT_TEMPLATE = (companyName, affect, stockSymbol = null) => {
    const companyIdentifier = stockSymbol ? `${companyName} (${stockSymbol})` : companyName;
    return `You are a business analyst examining how external factors affect company performance.

Based on the business knowledge and retrieved information, provide an analysis of how ${affect} impacts ${companyIdentifier}'s business performance and operations.
Please format the content in markdown format.
Please structure your response as follows:
1. Brief overview of the relationship between ${affect} and ${companyIdentifier}
2. Key impacts identified from the data
3. Notable examples or specific instances (if available)
4. Summary of the overall effect`;
};

exports.handler = async (event, context) => {
    try {
        console.log('DEBUGGING - Event received:', JSON.stringify(event, null, 2));
        
        let requestBody;
        if (event.body) {
            requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } else {
            requestBody = event;
        }

        console.log('DEBUGGING - Processed request body:', JSON.stringify(requestBody, null, 2));

        if (!requestBody.companyName || !requestBody.affect) {
            throw new Error('companyName and affect are required in the request');
        }

        if (!requestBody.bedrockRegion) {
            throw new Error('bedrockRegion is required in the request');
        }

        if (!isValidAwsRegion(requestBody.bedrockRegion)) {
            throw new Error('Invalid AWS region format');
        }

        const { 
            companyName, 
            affect, 
            knowledgeBaseId,  
            bedrockRegion,
            stockSymbol,
            guardrailId
        } = requestBody;

        if (knowledgeBaseId?.trim()) {
            console.log('DEBUGGING - Using knowledge base:', knowledgeBaseId);

            const bedrockClient = AWSXRay.captureAWSv3Client(new BedrockRuntimeClient({ 
                region: bedrockRegion 
            }));

            const agentClient = AWSXRay.captureAWSv3Client(new BedrockAgentRuntimeClient({ 
                region: bedrockRegion 
            }));

            const retrieveRequest = {
                input: {
                    text: BASE_PROMPT_TEMPLATE(companyName, affect, stockSymbol)
                },
                retrieveAndGenerateConfiguration: {
                    type: "KNOWLEDGE_BASE",
                    knowledgeBaseConfiguration: {
                        knowledgeBaseId: knowledgeBaseId,
                        modelArn: `arn:aws:bedrock:${bedrockRegion}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`
                    },
                    generationConfiguration: {
                        temperature: 0.7,
                        stopSequences: [],
                        maxTokenCount: 2048,
                        includeTokenUsage: true
                    }
                },
                ...(guardrailId && {
                    guardrailConfiguration: {
                        guardrailId: guardrailId
                    }
                }),
                responseStreamingConfiguration: {
                    enableTokenUsage: true,
                    streamingMetrics: true
                }
            };

            const response = await agentClient.send(new RetrieveAndGenerateCommand(retrieveRequest));
            const timestamp = new Date().toISOString();
            const functionArn = context.invokedFunctionArn;
            const requestId = response.$metadata.requestId;
            
            console.log('Function ARN:', functionArn);
            console.log('Function Name:', functionArn.split(':').pop());
            console.log('Timestamp:', timestamp);
            console.log('Region:', bedrockRegion);

            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

            const tokenUsage = await getTokenUsageForRequest(timestamp, functionArn, bedrockRegion);
            console.log('Token Usage from CloudWatch:', tokenUsage);
            response.tokenUsage = tokenUsage || {};

            console.log('DEBUGGING - Request ID:', response.$metadata.requestId);
            console.log('DEBUGGING - Metadata Content:', JSON.stringify(response.$metadata, null, 2));
            console.log('DEBUGGING - Output Content:', JSON.stringify(response.output, null, 2));
            console.log('DEBUGGING - Full Response Structure:', Object.keys(response));
            console.log('DEBUGGING - Response Metrics:', response.metrics);
            console.log('DEBUGGING - Response Usage:', response.usage);
            console.log('DEBUGGING - Response Token Usage:', response.tokenUsage);
            console.log('DEBUGGING - Output Structure:', Object.keys(response.output || {}));
            console.log('DEBUGGING - Streaming Config:', response.responseStreamingConfiguration);

            const tokenMetrics = response.metrics || 
                    response.usage || 
                    response.tokenUsage || 
                    (response.output && response.output.metrics) || 
                    {};

            console.log('DEBUGGING - Found Token Metrics:', tokenMetrics);

            const result = {
                message: response.output.text,
                companyQueried: companyName,
                stockSymbol: stockSymbol || null,
                factorAnalyzed: affect,
                retrievalMetadata: {
                    totalRetrieved: response.citations?.length || 0,
                    knowledgeBasesUsed: [knowledgeBaseId],
                    bedrockRegion: bedrockRegion,
                    usedKnowledgeBase: true,
                    guardrailId: guardrailId || null,
                    citations: response.citations || [],
                    tokenUsage: {
                        inputTokens: tokenMetrics.promptTokens || 
                                    tokenMetrics.inputTokens || 
                                    tokenMetrics.input_tokens || 0,
                        outputTokens: tokenMetrics.completionTokens || 
                                     tokenMetrics.outputTokens || 
                                     tokenMetrics.output_tokens || 0,
                        totalTokens: tokenMetrics.totalTokens || 
                                    tokenMetrics.total_tokens || 
                                    ((tokenMetrics.promptTokens || 0) + (tokenMetrics.completionTokens || 0))
                    }
                }
            };

            if (event.body) {
                return {
                    'statusCode': 200,
                    'headers': { 'Content-Type': 'application/json' },
                    'body': JSON.stringify(result),
                    'isBase64Encoded': false
                };
            }

            return result;

        } else {
            console.log('DEBUGGING - Falling back to direct Bedrock invocation');
            const bedrockClient = new BedrockRuntimeClient({ 
                region: bedrockRegion 
            });

            const baseRequest = {
                modelId: "anthropic.claude-v2",
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens_to_sample: 2048,
                    temperature: 0.7,
                    prompt: `\n\nHuman: ${BASE_PROMPT_TEMPLATE(companyName, affect, stockSymbol)}\n\nAssistant:`
                })
            };

            const command = new InvokeModelCommand(baseRequest);
            const response = await bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));

            const result = {
                message: responseBody.completion,
                companyQueried: companyName,
                stockSymbol: stockSymbol || null,
                factorAnalyzed: affect,
                retrievalMetadata: {
                    totalRetrieved: 0,
                    knowledgeBasesUsed: [],
                    bedrockRegion: bedrockRegion,
                    usedKnowledgeBase: false,
                    citations: []
                }
            };

            if (event.body) {
                return {
                    'statusCode': 200,
                    'headers': { 'Content-Type': 'application/json' },
                    'body': JSON.stringify(result),
                    'isBase64Encoded': false
                };
            }

            return result;
        }

    } catch (err) {
        console.error('DEBUGGING - Main Error Handler:', {
            message: err.message,
            name: err.name,
            metadata: err.$metadata,
            stack: err.stack
        });

        const errorResponse = {
            message: 'Error processing request',
            error: err.message
        };

        if (event.body) {
            return {
                'statusCode': err.message.includes('required') || 
                             err.message.includes('must be') || 
                             err.message.includes('Invalid AWS region') ? 400 : 500,
                'body': JSON.stringify(errorResponse)
            };
        }

        throw err;
    }
};
