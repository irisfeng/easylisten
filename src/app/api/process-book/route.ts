import { auth } from "@/auth";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseFileContent } from "@/lib/parser";
import { Readable } from "stream";

// 初始化 S3 客户端 (与 upload 接口相同)
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://f4ed9ccd1b669534b603d1c69051ffc9.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Helper function to stream S3 body to a buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}


export async function POST(request: Request) {
  let bookId: string | undefined;
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    bookId = body.bookId;
    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    // 1. 查找书籍并验证所有权
    const book = await prisma.book.findUnique({
      where: { id: bookId },
    });

    if (!book || book.userId !== userId) {
      return NextResponse.json({ error: "Book not found or access denied" }, { status: 404 });
    }
    
    if (book.processingStatus !== 'PENDING') {
      return NextResponse.json({ message: "Book is already processed or being processed." }, { status: 200 });
    }

    // 2. 更新状态为 PROCESSING
    await prisma.book.update({
      where: { id: bookId },
      data: { processingStatus: 'PROCESSING' },
    });
    
    // 3. 从 R2 下载文件
    const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: book.r2ObjectKey,
    });
    const response = await s3Client.send(getObjectCommand);
    
    if (!response.Body) {
        throw new Error("Failed to download file from R2: Body is empty.");
    }

    const fileBuffer = await streamToBuffer(response.Body as Readable);
    const mimeType = response.ContentType || 'application/octet-stream'; // Fallback MIME type

    // 4. 解析文件内容
    const { text } = await parseFileContent(fileBuffer, mimeType);

    // 5. 更新数据库
    await prisma.book.update({
        where: { id: bookId },
        data: {
            content: text,
            processingStatus: 'SUCCESS',
        },
    });

    return NextResponse.json({ success: true, message: "Book processed successfully." });

  } catch (error) {
    console.error(`Failed to process book ${bookId}:`, error);

    // 如果出错，将状态更新为FAILED
    if (bookId) {
      await prisma.book.update({
        where: { id: bookId },
        data: { processingStatus: 'FAILED' },
      }).catch(updateError => {
        console.error(`Failed to update book status to FAILED for book ${bookId}:`, updateError);
      });
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 