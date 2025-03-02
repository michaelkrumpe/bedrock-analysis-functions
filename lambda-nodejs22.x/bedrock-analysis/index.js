'use strict';

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = require("@aws-sdk/client-bedrock-agent-runtime");
const AWSXRay = require('aws-xray-sdk-core');
const { CloudWatchLogsClient, StartQueryCommand, GetLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");


const isValidAwsRegion = (region) => {
    const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
    return regionRegex.test(region);
};

const BASE_PROMPT_TEMPLATE = (companyName, affect, stockSymbol = null) => {
    const companyIdentifier = stockSymbol ? `${companyName} (${stockSymbol})` : companyName;
    return `You are a business analyst examining how external factors affect company performance.

Based on the business knowledge and retrieved information, provide an analysis of how ${affect} impacts ${companyIdentifier}'s business performance and operations.

Please structure your response as follows:
1. Brief overview of the relationship between ${affect} and ${companyIdentifier}
2. Key impacts identified from the data
3. Notable examples or specific instances (if available)
4. Summary of the overall effect

Please format the content in markdown format.
`;
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
                    citations: response.citations || []
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
                    guardrailId: guardrailId,
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
