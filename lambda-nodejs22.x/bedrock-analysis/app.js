const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = require("@aws-sdk/client-bedrock-agent-runtime");


const AWSXRay = require('aws-xray-sdk-core');  // Add this line

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

exports.lambdaHandler = async (event, context) => {
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
            stockSymbol 
        } = requestBody;

        console.log('DEBUGGING - Extracted Values:', {
            companyName,
            affect,
            knowledgeBaseId,
            bedrockRegion,
            stockSymbol
        });

        console.log('DEBUGGING - Knowledge Base Check:', {
            hasKnowledgeBaseId: Boolean(knowledgeBaseId),
            knowledgeBaseIdValue: knowledgeBaseId,
            knowledgeBaseIdType: typeof knowledgeBaseId,
            trimmedLength: knowledgeBaseId?.trim()?.length
        });

        if (knowledgeBaseId?.trim()) {
            console.log('DEBUGGING - Entering knowledge base path');
            console.log('Using knowledge base:', knowledgeBaseId);

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
                    }
                }
            };
            
            
            console.log('DEBUGGING - Retrieve Request:', JSON.stringify(retrieveRequest, null, 2));
            
            try {
                const response = await agentClient.send(new RetrieveAndGenerateCommand(retrieveRequest));
                console.log('DEBUGGING - Knowledge Base Response:', JSON.stringify(response, null, 2));

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
                        citations: response.citations || [],
                        tokenUsage: {
                            inputTokens: response.inputTokenUsage || 0,
                            outputTokens: response.outputTokenUsage || 0,
                            totalTokens: (response.inputTokenUsage || 0) + (response.outputTokenUsage || 0)
                    }
                };

                console.log('DEBUGGING - Successful knowledge base result:', JSON.stringify(result, null, 2));

                if (event.body) {
                    return {
                        'statusCode': 200,
                        'headers': { 'Content-Type': 'application/json' },
                        'body': JSON.stringify(result),
                        'isBase64Encoded': false
                    };
                }

                return result;

            } catch (kbError) {
                console.error('DEBUGGING - Knowledge Base Error:', {
                    message: kbError.message,
                    name: kbError.name,
                    metadata: kbError.$metadata,
                    stack: kbError.stack
                });
                throw kbError;
            }
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

            console.log('DEBUGGING - Direct Bedrock Request:', JSON.stringify(baseRequest, null, 2));

            const command = new InvokeModelCommand(baseRequest);
            const response = await bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));

            console.log('DEBUGGING - Direct Bedrock Response:', JSON.stringify(responseBody, null, 2));

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

            console.log('DEBUGGING - Direct Bedrock Result:', JSON.stringify(result, null, 2));

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
