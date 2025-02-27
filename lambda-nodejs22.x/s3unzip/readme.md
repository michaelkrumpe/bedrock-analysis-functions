### s3unzip

A Lambda function that processes compressed files (.zip, .gz, and .tar.gz) stored in S3, decompressing them and uploading the contents to a destination S3 location. Supports cross-region operations and handles large files through multipart uploads.

#### Detailed Operation

1. **Supported File Types**
   - ZIP archives (.zip)
   - Gzip files (.gz)
   - Tar Gzip archives (.tar.gz)

2. **Processing Modes**
   a. **ZIP Processing**
   - Extracts all files maintaining directory structure
   - Processes files individually
   - Preserves file names and paths
   
   b. **GZIP Processing**
   - Standard processing for files < 100MB
   - Multipart upload for files > 100MB
   - Preserves original filename without .gz extension
   
   c. **TAR.GZ Processing**
   - Extracts all files from archive
   - Maintains directory structure
   - Handles nested files and directories

#### Input Parameters

```json
{
    "sourceUri": "s3://source-bucket/path/to/file.zip",
    "destinationUri": "s3://destination-bucket/path/",
    "sourceRegion": "us-east-1",
    "destinationRegion": "us-east-1"
}
```

**Response Format**
```json
{
    "statusCode": 200,
    "body": {
        "message": "File processed successfully",
        "source": "s3://source-bucket/path/to/file.zip",
        "destination": "s3://destination-bucket/path/",
        "processedFiles": ["file1.txt", "file2.txt"],
        "fileType": ".zip"
    }
}
```

#### Key Features

1. **Cross-Region Support**
   - Source and destination can be in different regions
   - Region-specific S3 client initialization
   - Configurable default regions

2. **Large File Handling**
   - Multipart upload for large files (>100MB)
   - Chunked processing (5MB parts)
   - Progress tracking and logging
   - Automatic cleanup on failure

3. **Error Handling**
   - Comprehensive error catching
   - Detailed error logging
   - Clean failure states
   - Multipart upload abort on failure

**Required IAM Permissions**
```yaml
- Effect: Allow
  Action:
    - s3:GetObject
    - s3:PutObject
    - s3:AbortMultipartUpload
    - s3:ListMultipartUploadParts
    - s3:CreateMultipartUpload
    - s3:CompleteMultipartUpload
  Resource: 
    - "arn:aws:s3:::source-bucket/*"
    - "arn:aws:s3:::destination-bucket/*"
```

**Dependencies**
```json
{
  "@aws-sdk/client-s3": "latest",
  "unzipper": "latest",
  "tar-stream": "latest"
}
```

#### Processing Details

1. **ZIP File Processing**
   - Streaming decompression
   - Individual file processing
   - Directory structure preservation
   - Memory-efficient processing

2. **GZIP File Processing**
   - Standard mode:
     * Full decompression in memory
     * Single-part upload
   - Large file mode:
     * Streaming decompression
     * Multipart upload
     * Progress tracking
     * 5MB chunk size

3. **TAR.GZ Processing**
   - Two-stage decompression
   - Directory structure preservation
   - Individual file handling
   - Stream processing

**Error Response Format**
```json
{
    "statusCode": 500,
    "body": {
        "message": "Error processing request",
        "error": "Detailed error message",
        "errorType": "Error type",
        "stackTrace": "Stack trace (development only)"
    }
}
```

#### Best Practices

1. **Memory Management**
   - Use multipart upload for large files
   - Process files in streams where possible
   - Monitor memory usage

2. **Error Handling**
   - Implement proper cleanup
   - Monitor failed operations
   - Maintain audit logs
   - Handle incomplete multipart uploads

3. **Performance**
   - Configure appropriate Lambda timeout
   - Consider file size limits
   - Monitor memory allocation
   - Use appropriate instance size

#### Limitations and Considerations

1. **File Size**
   - Lambda timeout limits
   - Memory constraints
   - S3 multipart upload limits

2. **Security**
   - Cross-region data transfer
   - S3 bucket permissions
   - IAM role configuration

3. **Cost Considerations**
   - Data transfer costs
   - Lambda execution time
   - S3 operation costs

#### Monitoring and Debugging

- Detailed progress logging
- File size tracking
- Processing stage logging
- Error state capture
- Multipart upload tracking
