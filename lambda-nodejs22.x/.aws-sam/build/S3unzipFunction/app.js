const { 
    S3Client, 
    GetObjectCommand, 
    PutObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const unzipper = require('unzipper');
const zlib = require('zlib');
const tar = require('tar-stream');
const stream = require('stream');
const path = require('path');

// Create S3 clients for different regions as needed
const getS3Client = (region) => {
    return new S3Client({ region });
};

// Helper function to upload buffer to S3
const uploadToS3 = async (bucket, key, fileBuffer, region) => {
    try {
        console.log(`Uploading to ${bucket}/${key} in region ${region} (size: ${fileBuffer.length} bytes)`);
        const s3Client = getS3Client(region);
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileBuffer,
            ContentLength: fileBuffer.length
        }));
        console.log(`Successfully uploaded ${key} to ${bucket}`);
    } catch (err) {
        console.error(`Error uploading ${key} to ${bucket}:`, JSON.stringify(err));
        throw err;
    }
};

// Helper function with error handling
const parseS3Uri = (uri) => {
    try {
        console.log('Parsing S3 URI:', uri);
        const removeS3Prefix = uri.replace('s3://', '');
        const [bucket, ...keyParts] = removeS3Prefix.split('/');
        const key = keyParts.join('/');
        console.log('Successfully parsed S3 URI:', { bucket, key });
        return { bucket, key };
    } catch (error) {
        console.error('Error parsing S3 URI:', error);
        throw new Error(`Failed to parse S3 URI ${uri}: ${error.message}`);
    }
};

// Process tar.gz file function
const processTarGzFile = async (tarGzFile, destination, destinationRegion) => {
    return new Promise((resolve, reject) => {
        console.log('Processing tar.gz file...');
        const processedFiles = [];
        const extract = tar.extract();
        const gunzip = zlib.createGunzip();

        extract.on('entry', async (header, stream, next) => {
            try {
                // Skip if it's a directory
                if (header.type !== 'file') {
                    stream.resume();
                    next();
                    return;
                }

                const fileName = header.name;
                console.log(`Processing file from tar.gz: ${fileName}`);
                const chunks = [];

                stream.on('data', chunk => chunks.push(chunk));

                stream.on('end', async () => {
                    try {
                        const fileBuffer = Buffer.concat(chunks);
                        const destinationKey = `${destination.key}${fileName}`.replace(/^\/+/, '');
                        await uploadToS3(destination.bucket, destinationKey, fileBuffer, destinationRegion);
                        processedFiles.push(fileName);
                        next();
                    } catch (error) {
                        reject(error);
                    }
                });

                stream.on('error', (error) => {
                    console.error(`Error processing ${fileName}:`, error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });

        extract.on('finish', () => {
            console.log('Finished processing tar.gz file');
            resolve(processedFiles);
        });

        extract.on('error', (error) => {
            console.error('Error extracting tar:', error);
            reject(error);
        });

        gunzip.on('error', (error) => {
            console.error('Error decompressing gzip:', error);
            reject(error);
        });

        tarGzFile.Body.pipe(gunzip).pipe(extract);
    });
};

// Process gzip file function
const processGzipFile = async (gzipFile, destination, destinationRegion, originalFileName) => {
    return new Promise((resolve, reject) => {
        console.log('Processing gzip file...');
        
        // First, collect the decompressed data
        const gunzip = zlib.createGunzip();
        const chunks = [];
        let totalLength = 0;

        gunzip.on('data', chunk => {
            chunks.push(chunk);
            totalLength += chunk.length;
            if (totalLength % (5 * 1024 * 1024) === 0) { // Log every 5MB
                console.log(`Decompressed ${(totalLength / 1024 / 1024).toFixed(2)} MB`);
            }
        });

        gunzip.on('end', async () => {
            try {
                const fileBuffer = Buffer.concat(chunks);
                console.log(`Total decompressed size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);

                // Create destination key using original filename without .gz
                const baseFileName = originalFileName.replace(/\.gz$/, '');
                const destinationKey = path.join(destination.key, baseFileName).replace(/^\/+/, '');
                
                const s3Client = getS3Client(destinationRegion);
                await s3Client.send(new PutObjectCommand({
                    Bucket: destination.bucket,
                    Key: destinationKey,
                    Body: fileBuffer,
                    ContentLength: fileBuffer.length
                }));

                console.log(`Successfully uploaded ${destinationKey}`);
                resolve([destinationKey]);
            } catch (error) {
                console.error('Error uploading to S3:', error);
                reject(error);
            }
        });

        gunzip.on('error', (error) => {
            console.error('Error decompressing gzip:', error);
            reject(error);
        });

        // Pipe the input stream to gunzip
        gzipFile.Body.pipe(gunzip);

        // Handle source stream errors
        gzipFile.Body.on('error', (error) => {
            console.error('Error in source stream:', error);
            reject(error);
        });
    });
};

// Process large gzip file with multipart upload
const processLargeGzipFile = async (gzipFile, destination, destinationRegion, originalFileName) => {
    const s3Client = getS3Client(destinationRegion);
    
    // Create destination key using original filename without .gz
    const baseFileName = originalFileName.replace(/\.gz$/, '');
    const destinationKey = path.join(destination.key, baseFileName).replace(/^\/+/, '');
    
    console.log(`Starting multipart upload to ${destination.bucket}/${destinationKey}`);
    
    const multipartUpload = await s3Client.send(new CreateMultipartUploadCommand({
        Bucket: destination.bucket,
        Key: destinationKey
    }));

    const uploadId = multipartUpload.UploadId;
    const parts = [];
    let partNumber = 1;
    const PART_SIZE = 5 * 1024 * 1024; // 5MB parts

    return new Promise((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        let buffer = Buffer.alloc(0);
        let totalProcessed = 0;

        gunzip.on('data', async (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            totalProcessed += chunk.length;

            if (buffer.length >= PART_SIZE) {
                try {
                    const partBuffer = buffer.slice(0, PART_SIZE);
                    buffer = buffer.slice(PART_SIZE);

                    const uploadPartResponse = await s3Client.send(new UploadPartCommand({
                        Bucket: destination.bucket,
                        Key: destinationKey,
                        PartNumber: partNumber,
                        UploadId: uploadId,
                        Body: partBuffer
                    }));

                    parts.push({
                        PartNumber: partNumber,
                        ETag: uploadPartResponse.ETag
                    });

                    console.log(`Uploaded part ${partNumber}, size: ${(PART_SIZE / 1024 / 1024).toFixed(2)} MB, total: ${(totalProcessed / 1024 / 1024).toFixed(2)} MB`);
                    partNumber++;
                } catch (error) {
                    gunzip.destroy();
                    reject(error);
                }
            }
        });

        gunzip.on('end', async () => {
            try {
                // Upload any remaining data
                if (buffer.length > 0) {
                    const uploadPartResponse = await s3Client.send(new UploadPartCommand({
                        Bucket: destination.bucket,
                        Key: destinationKey,
                        PartNumber: partNumber,
                        UploadId: uploadId,
                        Body: buffer
                    }));

                    parts.push({
                        PartNumber: partNumber,
                        ETag: uploadPartResponse.ETag
                    });
                }

                // Complete the multipart upload
                await s3Client.send(new CompleteMultipartUploadCommand({
                    Bucket: destination.bucket,
                    Key: destinationKey,
                    UploadId: uploadId,
                    MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) }
                }));

                console.log(`Successfully uploaded ${destinationKey}`);
                resolve([destinationKey]);
            } catch (error) {
                reject(error);
            }
        });

        gunzip.on('error', async (error) => {
            try {
                await s3Client.send(new AbortMultipartUploadCommand({
                    Bucket: destination.bucket,
                    Key: destinationKey,
                    UploadId: uploadId
                }));
            } catch (abortError) {
                console.error('Error aborting multipart upload:', abortError);
            }
            reject(error);
        });

        gzipFile.Body.pipe(gunzip);
    });
};

// Process zip file function
const processZipFile = async (zipFile, destination, destinationRegion) => {
    return new Promise((resolve, reject) => {
        const processedFiles = [];
        const directory = zipFile.Body.pipe(unzipper.Parse());

        directory.on('error', (error) => {
            console.error('Error in zip processing:', error);
            reject(error);
        });

        directory.on('entry', (entry) => {
            const fileName = entry.path;
            const type = entry.type;
            const size = entry.vars.uncompressedSize;
            console.log(`Processing entry: ${fileName} (${type}) - Size: ${size} bytes`);

            try {
                if (type === 'File') {
                    const destinationKey = `${destination.key}${fileName}`.replace(/^\/+/, '');
                    
                    // Create a buffer to store the file content
                    const chunks = [];
                    entry.on('data', chunk => chunks.push(chunk));
                    
                    entry.on('end', async () => {
                        try {
                            const fileBuffer = Buffer.concat(chunks);
                            await uploadToS3(destination.bucket, destinationKey, fileBuffer, destinationRegion);
                            processedFiles.push(fileName);
                            console.log(`Successfully processed ${fileName}`);
                        } catch (error) {
                            console.error(`Error uploading ${fileName}:`, error);
                            reject(error);
                        }
                    });

                    entry.on('error', (error) => {
                        console.error(`Error processing entry ${fileName}:`, error);
                        reject(error);
                    });
                } else {
                    entry.autodrain();
                    console.log(`Skipped directory: ${fileName}`);
                }
            } catch (error) {
                console.error(`Error processing ${fileName}:`, error);
                entry.autodrain();
                reject(error);
            }
        });

        directory.on('end', () => {
            console.log('Zip processing completed');
            resolve(processedFiles);
        });

        zipFile.Body.on('error', (error) => {
            console.error('Error in source stream:', error);
            reject(error);
        });
    });
};

exports.lambdaHandler = async (event) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));
        
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            console.log('Successfully parsed body:', JSON.stringify(body, null, 2));
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: 'Error parsing request body',
                    error: parseError.message
                }),
                isBase64Encoded: false
            };
        }

        const { 
            sourceUri, 
            destinationUri, 
            sourceRegion = 'us-east-1',
            destinationRegion = 'us-east-1'
        } = body || {};

        if (!sourceUri || !destinationUri) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: 'Missing required parameters',
                    error: 'sourceUri and destinationUri are required'
                }),
                isBase64Encoded: false
            };
        }

        console.log('Processing request with parameters:', {
            sourceUri,
            destinationUri,
            sourceRegion,
            destinationRegion
        });

        const source = parseS3Uri(sourceUri);
        const destination = parseS3Uri(destinationUri);

        // Get the original filename
        const originalFileName = path.basename(source.key);
        console.log('Original filename:', originalFileName);

        console.log('Retrieving source file...');
        const sourceS3Client = getS3Client(sourceRegion);
        const compressedFile = await sourceS3Client.send(new GetObjectCommand({
            Bucket: source.bucket,
            Key: source.key
        }));
        console.log('Successfully retrieved source file');

        // Get the file size from the response
        const fileSize = compressedFile.ContentLength;
        console.log(`Source file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        // Determine file type and process accordingly
        const fileExtension = path.extname(source.key).toLowerCase();
        const isTarGz = source.key.toLowerCase().endsWith('.tar.gz');
        let processedFiles;

        if (isTarGz) {
            console.log('Processing as tar.gz file...');
            processedFiles = await processTarGzFile(compressedFile, destination, destinationRegion);
        } else if (fileExtension === '.gz') {
            if (fileSize > 100 * 1024 * 1024) { // If file is larger than 100MB
                console.log('Using multipart upload for large file...');
                processedFiles = await processLargeGzipFile(compressedFile, destination, destinationRegion, originalFileName);
            } else {
                console.log('Processing as standard gzip file...');
                processedFiles = await processGzipFile(compressedFile, destination, destinationRegion, originalFileName);
            }
        } else if (fileExtension === '.zip') {
            console.log('Processing as zip file...');
            processedFiles = await processZipFile(compressedFile, destination, destinationRegion);
        } else {
            throw new Error(`Unsupported file extension: ${fileExtension}. Only .zip, .gz, and .tar.gz files are supported.`);
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'File processed successfully',
                source: sourceUri,
                destination: destinationUri,
                processedFiles: processedFiles,
                fileType: isTarGz ? '.tar.gz' : fileExtension
            }),
            isBase64Encoded: false
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'Error processing request',
                error: error.message,
                errorType: error.name,
                stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }),
            isBase64Encoded: false
        };
    }
};
