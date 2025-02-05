const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const unzipper = require('unzipper');
const stream = require('stream');

const s3Client = new S3Client();

// Helper function to parse S3 URI
const parseS3Uri = (uri) => {
    const removeS3Prefix = uri.replace('s3://', '');
    const [bucket, ...keyParts] = removeS3Prefix.split('/');
    const key = keyParts.join('/');
    return { bucket, key };
};

// Helper function to upload stream to S3
const uploadToS3 = async (bucket, key, bodyStream) => {
    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bodyStream
        }));
    } catch (err) {
        console.error(`Error uploading ${key} to ${bucket}:`, err);
        throw err;
    }
};

exports.lambdaHandler = async (event) => {
    try {
        // Expect sourceUri and destinationUri in the event payload
        const { sourceUri, destinationUri } = event;
        
        if (!sourceUri || !destinationUri) {
            throw new Error('sourceUri and destinationUri are required');
        }

        // Parse S3 URIs
        const source = parseS3Uri(sourceUri);
        const destination = parseS3Uri(destinationUri);

        console.log(`Processing zip file from ${source.bucket}/${source.key}`);

        // Get the zip file from S3
        const zipFile = await s3Client.send(new GetObjectCommand({
            Bucket: source.bucket,
            Key: source.key
        }));

        // Create directory parser for the zip file
        const directory = await zipFile.Body.pipe(unzipper.Parse());

        // Process each file in the zip
        for await (const entry of directory) {
            const fileName = entry.path;
            const type = entry.type; // 'Directory' or 'File'

            if (type === 'File') {
                const destinationKey = `${destination.key}/${fileName}`.replace(/^\/+/, '');
                
                console.log(`Extracting ${fileName} to ${destination.bucket}/${destinationKey}`);

                // Upload the file to the destination
                await uploadToS3(destination.bucket, destinationKey, entry);
            } else {
                // Skip directories
                entry.autodrain();
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Zip file extracted successfully',
                source: sourceUri,
                destination: destinationUri
            })
        };
    } catch (err) {
        console.error('Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error processing zip file',
                error: err.message
            })
        };
    }
};
