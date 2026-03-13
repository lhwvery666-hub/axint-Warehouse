"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { UserRole, USER_ROLE_LABELS } from "@/lib/enums";

interface Message {
  id: number;
  ticketId: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

interface TicketChatProps {
  ticketId: string;
  currentUser: {
    name: string;
    role: UserRole;
  };
}

export function TicketChat({ ticketId, currentUser }: TicketChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // 加载历史消息
  useEffect(() => {
    loadMessages();
  }, [ticketId]);

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/messages?ticketId=${encodeURIComponent(ticketId)}`);
      const result = await response.json();

      if (result.success) {
        const loadedMessages = result.data || [];
        setMessages(loadedMessages);
        console.log(`✅ 加载了 ${result.count} 条聊天记录`);
        // 将当前消息数记录到 localStorage，表示用户已阅读至此
        if (typeof window !== 'undefined' && ticketId) {
          localStorage.setItem(`chat_seen_${ticketId}`, String(loadedMessages.length));
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error("加载聊天记录失败:", error);
      toast({
        title: "加载失败",
        description: error.message || "无法加载聊天记录",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      toast({
        title: "消息不能为空",
        description: "请输入消息内容后再发送",
        variant: "destructive",
      });
      return;
    }

    try {
      setSending(true);

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          senderName: currentUser.name,
          senderRole: currentUser.role,
          content: newMessage.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 立即添加到消息列表
        setMessages((prev) => [...prev, result.data]);
        setNewMessage("");
        
        toast({
          title: "发送成功",
          description: "消息已发送",
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error("发送消息失败:", error);
      toast({
        title: "发送失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 判断消息是否是当前用户发送的
  const isMyMessage = (message: Message) => {
    return message.senderRole === currentUser.role && message.senderName === currentUser.name;
  };

  // 获取发送者名称的首字母（用于头像）
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="w-5 h-5" />
          工单沟通记录
          {messages.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({messages.length} 条消息)
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* 消息列表区域 */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageCircle className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm">暂无聊天记录</p>
              <p className="text-xs mt-1">在下方输入框发送第一条消息</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isMine = isMyMessage(message);
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      isMine ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* 头像 */}
                    <Avatar className={cn(
                      "w-8 h-8 flex-shrink-0",
                      isMine ? "bg-blue-500" : "bg-gray-500"
                    )}>
                      <AvatarFallback className="text-white text-xs">
                        {getInitials(message.senderName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* 消息内容 */}
                    <div
                      className={cn(
                        "flex flex-col max-w-[70%]",
                        isMine ? "items-end" : "items-start"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-700">
                          {message.senderName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                      
                      <div
                        className={cn(
                          "rounded-lg px-4 py-2 break-words",
                          isMine
                            ? "bg-blue-500 text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-900 rounded-tl-none"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* 发送消息区域 */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入消息... (按 Enter 发送)"
              disabled={sending}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim()}
              size="icon"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            当前身份：{currentUser.name} ({USER_ROLE_LABELS[currentUser.role]})
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
