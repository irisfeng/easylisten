"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Book, Globe, Settings, Upload, User, PlayCircle, CheckCircle2, AlertTriangle, LogIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDropzone } from "react-dropzone";
import { useCallback, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

// 模拟的书籍数据
const recentBooks = [
  {
    title: "人类简史：从动物到上帝",
    lastListened: "昨天 15:30",
    progress: 45,
  },
  {
    title: "原则：生活和工作",
    lastListened: "3天前 10:15",
    progress: 72,
  },
  {
    title: "设计心理学：日常的设计",
    lastListened: "一周前",
    progress: 12,
  },
];

// 新的上传组件
function UploadZone({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"pending" | "uploading" | "processing" | "success" | "error" | null>(null);
  const [statusMessage, setStatusMessage] = useState("拖拽文件到此处或点击上传");

  const isUploadingOrProcessing = uploadStatus === "uploading" || uploadStatus === "processing";

  const processBook = async (bookId: string) => {
    try {
      setUploadStatus("processing");
      setStatusMessage("正在解析文件...");
      const res = await fetch("/api/process-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        throw new Error("Failed to process book.");
      }
      setUploadStatus("success");
      setStatusMessage("处理完成！");
    } catch (error) {
      console.error("Processing failed:", error);
      setUploadStatus("error");
      setStatusMessage("文件解析失败");
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadProgress(0);
    setUploadStatus("pending");
    setStatusMessage("正在准备上传...");

    try {
      // 1. 获取预签名 URL
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fileType: file.type, 
          fileSize: file.size,
          originalFileName: file.name
        }),
      });
      
      const { url, bookId } = await res.json();
      if (!res.ok) throw new Error("Failed to get pre-signed URL.");

      setUploadStatus("uploading");
      setStatusMessage("正在上传...");

      // 2. 上传文件到 R2
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          console.log("File uploaded successfully. Book ID:", bookId);
          // 触发后台处理
          processBook(bookId);
        } else {
          setUploadStatus("error");
          setStatusMessage("上传失败");
        }
      };
      
      xhr.onerror = () => {
        setUploadStatus("error");
        setStatusMessage("上传过程中发生网络错误");
      };

      xhr.send(file);

    } catch (error) {
      console.error(error);
      setUploadStatus("error");
      setStatusMessage("获取上传授权失败");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
      "text/plain": [".txt"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: !isLoggedIn || isUploadingOrProcessing,
  });

  if (!isLoggedIn) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center p-10 text-center">
          <div className="p-4 bg-gray-100 rounded-full dark:bg-gray-800">
            <LogIn className="w-8 h-8 text-gray-500 dark:text-gray-400" />
          </div>
          <p className="mt-4 font-semibold">请先登录以使用上传功能</p>
          <Button asChild className="mt-4">
            <Link href="/sign-in">前往登录</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card {...getRootProps()} className={`border-dashed border-2 ${isDragActive ? 'border-blue-500' : ''} ${!isLoggedIn || isUploadingOrProcessing ? 'cursor-not-allowed bg-gray-50' : ''}`}>
      <input {...getInputProps()} />
      <CardContent className="flex flex-col items-center justify-center p-10 text-center">
        {uploadStatus ? (
          <div className="w-full max-w-xs space-y-4">
            {uploadStatus === 'success' ? (
                <>
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                    <p className="font-semibold">{statusMessage}</p>
                </>
            ) : uploadStatus === 'error' ? (
                <>
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
                    <p className="font-semibold">{statusMessage}</p>
                </>
            ) : (
                <>
                    <p className="font-semibold">{statusMessage} {uploadStatus === 'uploading' && `${uploadProgress}%`}</p>
                    <Progress value={uploadProgress || 0} />
                </>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 bg-gray-100 rounded-full dark:bg-gray-800">
              <Upload className="w-8 h-8 text-gray-500 dark:text-gray-400" />
            </div>
            <p className="mt-4 font-semibold">{statusMessage}</p>
            <p className="text-sm text-muted-foreground mt-1">支持 PDF、EPUB 和 TXT 格式文件</p>
            <Button type="button" className="mt-4">
              <Book className="w-4 h-4 mr-2" />
              选择文件
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const isLoading = status === 'loading';

  if (isLoading) {
    return <div>Loading...</div>; // Or a proper skeleton loader
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/90 dark:bg-black">
      <header className="flex items-center justify-between p-4 px-6 border-b bg-white dark:bg-gray-950">
        <div className="flex items-center gap-2">
          <Book className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold">轻听</h1>
        </div>
        <nav className="flex items-center gap-4">
          {isLoggedIn ? (
            <>
              <Button>升级订阅</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <User className="w-5 h-5" />
                    <span className="sr-only">Toggle user menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{session?.user?.name || '我的账户'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>个人中心</DropdownMenuItem>
                  <DropdownMenuItem>订阅管理</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild>
              <Link href="/sign-in">登录/注册</Link>
            </Button>
          )}
          <Button variant="outline" size="icon">
            <Globe className="w-5 h-5" />
            <span className="sr-only">语言</span>
          </Button>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center p-4 md:p-8">
        <div className="w-full max-w-4xl">
          <div className="text-center my-8">
            <h2 className="text-3xl font-bold">轻听, 让阅读变得轻松</h2>
            <p className="text-muted-foreground mt-2">
              上传您的电子书, 通过高质量文本转语音技术开始听书
            </p>
          </div>

          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-3 md:w-1/2 mx-auto">
              <TabsTrigger value="upload">
                <Upload className="w-4 h-4 mr-2" />
                上传
              </TabsTrigger>
              <TabsTrigger value="player" disabled>
                <PlayCircle className="w-4 h-4 mr-2" />
                播放
              </TabsTrigger>
              <TabsTrigger value="settings" disabled>
                <Settings className="w-4 h-4 mr-2" />
                设置
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-6">
              <UploadZone isLoggedIn={isLoggedIn} />
            </TabsContent>
          </Tabs>

          <section className="mt-12">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold">最近听过的书籍</h3>
              <Button variant="link">查看全部</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3 sm:grid-cols-2">
              {recentBooks.map((book, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-center h-24 mb-4 bg-gray-100 rounded-md dark:bg-gray-800">
                      <Book className="w-8 h-8 text-gray-400" />
                    </div>
                    <h4 className="font-semibold truncate">{book.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {book.lastListened}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={book.progress} className="w-full" />
                      <span className="text-xs text-muted-foreground">
                        {book.progress}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
} 