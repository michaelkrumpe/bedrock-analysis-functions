// const axios = require('axios')
// const url = 'http://checkip.amazonaws.com/';
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
let response;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */

exports.lambdaHandler = async (event, context) => {
    try {
        // Initialize the Bedrock client
        const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });

        // Get the company name from the POST request body
        if (!event.body) {
            throw new Error('Request body is required');
        }

        const requestBody = JSON.parse(event.body);
        if (!requestBody.companyName) {
            throw new Error('companyName is required in the request body');
        }

        const companyName = requestBody.companyName;
        
        // Prepare the request for Claude model
        const request = {
            modelId: "anthropic.claude-v2",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                prompt: `\n\nHuman: Please provide information about ${companyName}.\n\nAssistant:`,
                max_tokens_to_sample: 2000,
                temperature: 0.7,
                top_p: 1
            })
        };

        // Invoke the model
        const command = new InvokeModelCommand(request);
        const bedrockResponse = await bedrockClient.send(command);

        // Parse the response
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));

        response = {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': JSON.stringify({
                message: responseBody.completion,
                companyQueried: companyName
            })
        };
    } catch (err) {
        console.log(err);
        response = {
            'statusCode': err.message.includes('required') ? 400 : 500,
            'body': JSON.stringify({
                message: 'Error processing request',
                error: err.message
            })
        };
    }

    return response;
};