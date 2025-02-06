const { 
    BedrockAgentRuntimeClient, 
    RetrieveAndGenerateCommand
} = require("@aws-sdk/client-bedrock-agent-runtime");

const isValidAwsRegion = (region) => {
    const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
    return regionRegex.test(region);
};

// Base prompt template
const BASE_PROMPT_TEMPLATE = (companyName, affect, stockSymbol = null) => {
    const companyIdentifier = stockSymbol ? `${companyName} (${stockSymbol})` : companyName;
    
    return `You are a business analyst examining how external factors affect company performance.

Based on the retrieved information, provide an analysis of how ${affect} impacts ${companyIdentifier}'s business performance and operations.
Please format the content in markdown format.
Please structure your response as follows:
1. Brief overview of the relationship between ${affect} and ${companyIdentifier}
2. Key impacts identified from the data
3. Notable examples or specific instances (if available)
4. Summary of the overall effect`;
};

exports.lambdaHandler = async (event, context) => {
    try {
        console.log('Event received:', JSON.stringify(event, null, 2));
        
        // Determine if this is an API Gateway event or direct invocation
        let requestBody;
        if (event.body) {
            // API Gateway event
            requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } else {
            // Direct invocation
            requestBody = event;
        }

        console.log('Processed request body:', JSON.stringify(requestBody, null, 2));

        // Validate required parameters
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
            knowledgeBaseIds, 
            bedrockRegion,
            stockSymbol 
        } = requestBody;

        console.log('Using Bedrock region:', bedrockRegion);
        if (knowledgeBaseIds) {
            if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
                throw new Error('If provided, knowledgeBaseIds must be a non-empty array');
            }
            console.log('Using knowledge bases:', knowledgeBaseIds);
        }

        // Initialize the Bedrock client with the specified region
        const bedrockAgentClient = new BedrockAgentRuntimeClient({ 
            region: bedrockRegion 
        });

        let retrieveAndGenerateRequest;
        
        if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
            // If knowledge bases are provided, use them for retrieval
            retrieveAndGenerateRequest = {
                knowledgeBaseIds: knowledgeBaseIds,
                retrievalQuery: `Information about ${companyName}${stockSymbol ? ` (${stockSymbol})` : ''} and how ${affect} affects its business performance and operations`,
                retrievalConfiguration: {
                    vectorSearchConfiguration: {
                        numberOfResults: 3
                    }
                },
                promptTemplate: `${BASE_PROMPT_TEMPLATE(companyName, affect, stockSymbol)}

Focus on factual information from the provided data sources.`
            };
        } else {
            // If no knowledge bases are provided, just use the prompt without retrieval
            retrieveAndGenerateRequest = {
                promptTemplate: `${BASE_PROMPT_TEMPLATE(companyName, affect, stockSymbol)}

Base your analysis on general business principles and industry knowledge.`
            };
        }

        console.log('Sending RetrieveAndGenerate request:', JSON.stringify(retrieveAndGenerateRequest, null, 2));
        
        const command = new RetrieveAndGenerateCommand(retrieveAndGenerateRequest);
        const response = await bedrockAgentClient.send(command);

        const responseBody = {
            message: response.generateResponse.output,
            companyQueried: companyName,
            stockSymbol: stockSymbol || null,
            factorAnalyzed: affect,
            retrievalMetadata: {
                totalRetrieved: response.retrievalResults?.length || 0,
                knowledgeBasesUsed: knowledgeBaseIds || [],
                bedrockRegion: bedrockRegion,
                usedKnowledgeBases: knowledgeBaseIds ? true : false
            }
        };

        // If this was an API Gateway event, wrap the response appropriately
        if (event.body) {
            return {
                'statusCode': 200,
                'headers': { 'Content-Type': 'application/json' },
                'body': JSON.stringify(responseBody),
                'isBase64Encoded': false
            };
        }

        // For direct invocation, return the response body directly
        return responseBody;

    } catch (err) {
        console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });

        const errorResponse = {
            message: 'Error processing request',
            error: err.message
        };

        // If this was an API Gateway event, wrap the error response appropriately
        if (event.body) {
            return {
                'statusCode': err.message.includes('required') || 
                             err.message.includes('must be') || 
                             err.message.includes('Invalid AWS region') ? 400 : 500,
                'body': JSON.stringify(errorResponse)
            };
        }

        // For direct invocation, throw the error or return error response
        throw err;
    }
};
