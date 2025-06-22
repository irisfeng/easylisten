"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { FormEvent } from "react";

export default function SignInPage() {
  
  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    await signIn("credentials", {
      email,
      password,
      redirectTo: "/", // 登录成功后重定向到首页
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="inline-flex justify-center items-center gap-2">
            <Book className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold">轻听</h1>
          </div>
          <CardTitle className="text-2xl font-bold pt-4">欢迎回来</CardTitle>
          <CardDescription>
            输入您的凭据以访问您的账户
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
                required
                defaultValue="test@example.com"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required 
                defaultValue="password"
                className="h-12"
              />
            </div>
            <Button type="submit" className="w-full !mt-6" size="lg">
              安全登录
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center text-sm">
           <p className="text-muted-foreground">
              还没有账户?{" "}
              <Link
                href="#"
                className="font-semibold text-blue-600 hover:underline"
              >
                立即注册
              </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
} 