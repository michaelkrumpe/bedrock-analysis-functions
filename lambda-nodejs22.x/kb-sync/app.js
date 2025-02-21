const { 
  BedrockAgentClient, 
  ListDataSourcesCommand, 
  StartIngestionJobCommand 
} = require("@aws-sdk/client-bedrock-agent");

exports.lambdaHandler = async (event, context) => {
    try {
        // Extract Knowledge Base ID from event
        const knowledgeBaseId = event.knowledgeBaseId;
        if (!knowledgeBaseId) {
            throw new Error('Knowledge Base ID is required');
        }

        // Initialize Bedrock Agent client
        const client = new BedrockAgentClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        // List all data sources for the Knowledge Base
        const listDataSourcesResponse = await client.send(new ListDataSourcesCommand({
            knowledgeBaseId: knowledgeBaseId
        }));

        // Track sync jobs started
        const syncResults = [];

        // Start ingestion job for each data source
        for (const dataSource of listDataSourcesResponse.dataSources) {
            try {
                const startIngestionResponse = await client.send(new StartIngestionJobCommand({
                    knowledgeBaseId: knowledgeBaseId,
                    dataSourceId: dataSource.dataSourceId
                }));

                syncResults.push({
                    dataSourceId: dataSource.dataSourceId,
                    dataSourceName: dataSource.name,
                    ingestionJobId: startIngestionResponse.ingestionJob.ingestionJobId,
                    status: startIngestionResponse.ingestionJob.status
                });
            } catch (error) {
                console.error(`Error syncing data source ${dataSource.dataSourceId}:`, error);
                syncResults.push({
                    dataSourceId: dataSource.dataSourceId,
                    dataSourceName: dataSource.name,
                    error: error.message
                });
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Knowledge Base sync initiated',
                knowledgeBaseId: knowledgeBaseId,
                totalDataSources: listDataSourcesResponse.dataSources.length,
                syncResults: syncResults
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error initiating Knowledge Base sync',
                error: error.message
            })
        };
    }
};
