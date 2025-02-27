const { 
    BedrockAgentClient, 
    ListDataSourcesCommand, 
    StartIngestionJobCommand 
  } = require("@aws-sdk/client-bedrock-agent");
  
  const formatTimestamp = (date) => {
      const pad = (num) => num.toString().padStart(2, '0');
      
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      const seconds = pad(date.getSeconds());
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const year = date.getFullYear();
  
      return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
  };
  
  exports.lambdaHandler = async (event, context) => {
      try {
          // Extract Knowledge Base ID from event
          const knowledgeBaseId = event.knowledgeBaseId;
          if (!knowledgeBaseId) {
              throw new Error('Knowledge Base ID is required');
          }
  
          // Get current timestamp and format it
          const now = new Date();
          const syncStartTime = formatTimestamp(now);
          const isoTimestamp = now.toISOString(); // Keep ISO format for logging
  
          // Initialize Bedrock Agent client
          const client = new BedrockAgentClient({
              region: process.env.AWS_REGION || 'us-east-1'
          });
  
          // Start the sync process without waiting for completion
          client.send(new ListDataSourcesCommand({
              knowledgeBaseId: knowledgeBaseId
          })).then(async (listDataSourcesResponse) => {
              // Start ingestion job for each data source
              for (const dataSource of listDataSourcesResponse.dataSources) {
                  try {
                      await client.send(new StartIngestionJobCommand({
                          knowledgeBaseId: knowledgeBaseId,
                          dataSourceId: dataSource.dataSourceId
                      }));
                      console.log(`Started sync for data source: ${dataSource.dataSourceId} at ${isoTimestamp}`);
                  } catch (error) {
                      console.error(`Error syncing data source ${dataSource.dataSourceId}:`, error);
                  }
              }
          }).catch(error => {
              console.error('Error in async sync process:', error);
          });
  
          // Return immediately with formatted timestamp
          return {
            statusCode: 200,
            body: {
                message: 'Knowledge Base sync initiated',
                knowledgeBaseId: knowledgeBaseId,
                syncStartTime: syncStartTime,
                isoTimestamp: isoTimestamp
            }
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
  