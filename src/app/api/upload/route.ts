import { auth } from "@/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db"; // 导入 Prisma Client

// 初始化 S3 客户端
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://f4ed9ccd1b669534b603d1c69051ffc9.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// 生成一个安全的随机文件名
const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { fileType, fileSize, originalFileName } = await request.json();

    // 在这里可以添加文件类型和大小的校验
    const allowedFileTypes = [
      "application/pdf", 
      "application/epub+zip", 
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (!allowedFileTypes.includes(fileType)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
    // 限制文件大小为 100MB
    if (fileSize > 100 * 1024 * 1024) {
        return NextResponse.json({ error: "File size exceeds 100MB" }, { status: 400 });
    }

    const r2ObjectKey = generateFileName();
    
    // 在返回预签名URL之前，先在数据库中创建记录
    const book = await prisma.book.create({
      data: {
        userId,
        r2ObjectKey,
        originalFileName,
        processingStatus: 'PENDING',
      }
    });

    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: r2ObjectKey,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const signedUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: 60, // URL 有效期 60 秒
    });

    // 返回给前端的信息中，也包含新创建的书籍ID
    return NextResponse.json({ url: signedUrl, bookId: book.id });

  } catch (error) {
    console.error("Error creating signed URL or DB record:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 