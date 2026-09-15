import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, X, Plus, Eye, Send, ChevronLeft, ChevronRight, Trash2, Camera, Pencil, Brain } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

interface StoryMedia {
  id: number;
  type: string;
  url: string | null;
  textContent?: string | null;
  caption?: string | null;
}

interface StoryData {
  id: number;
  userId: string;
  createdAt: string;
  expiresAt: string;
  media: StoryMedia[];
  likeCount?: number;
  viewCount?: number;
}

export type OwnStory = StoryData & { viewCount: number; likeCount: number };

interface StoryGroup {
  userId: string;
  user: { firstName: string; profileImageUrl?: string };
  stories: StoryData[];
}

interface StoryCircleProps {
  userId: string;
  userName: string;
  profileImageUrl?: string;
  hasUnviewed?: boolean;
  onClick?: () => void;
}

export function StoryCircle({ userId, userName, profileImageUrl, hasUnviewed = true, onClick }: StoryCircleProps) {
  return (
    <button
      className="flex flex-col items-center gap-1 cursor-pointer"
      onClick={onClick}
      data-testid={`story-circle-${userId}`}
    >
      <div
        style={{
          padding: "2px",
          borderRadius: "50%",
          background: hasUnviewed
            ? "#FF6B4A"
            : "rgba(255,255,255,0.09)",
        }}
      >
        <div style={{ padding: "2px", borderRadius: "50%", background: "#0C0910" }}>
          <Avatar className="w-14 h-14">
            <AvatarImage src={profileImageUrl} alt={userName} />
            <AvatarFallback className="text-sm font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: "#FFFFFF" }}>
              {userName?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
      <span className="text-xs truncate max-w-[64px]" style={{ color: "#A79FB4" }} data-testid={`text-story-name-${userId}`}>
        {userName}
      </span>
    </button>
  );
}

interface StoryViewerProps {
  stories: StoryData[];
  initialIndex: number;
  onClose: () => void;
  userName?: string;
  profileImageUrl?: string;
  onInterviewTwin?: () => void;
}

export function StoryViewer({ stories, initialIndex, onClose, userName, profileImageUrl, onInterviewTwin }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartY = useRef<number | null>(null);
  const viewTrackedRef = useRef<Set<number>>(new Set());

  const currentStory = stories[currentIndex];
  const currentMedia = currentStory?.media?.[0];

  const likeMutation = useMutation({
    mutationFn: async (storyId: number) => {
      await apiRequest("POST", `/api/stories/${storyId}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ storyId, text }: { storyId: number; text: string }) => {
      await apiRequest("POST", `/api/stories/${storyId}/comment`, { text });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
    },
  });

  const viewMutation = useMutation({
    mutationFn: async (storyId: number) => {
      await apiRequest("POST", `/api/stories/${storyId}/view`);
    },
  });

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((p) => p + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((p) => p - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (currentStory && !viewTrackedRef.current.has(currentStory.id)) {
      viewTrackedRef.current.add(currentStory.id);
      viewMutation.mutate(currentStory.id);
    }
  }, [currentStory?.id]);

  useEffect(() => {
    if (isPaused) return;
    const DURATION = 5000;
    const INTERVAL = 50;
    const increment = (INTERVAL / DURATION) * 100;
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) { goNext(); return 0; }
        return prev + increment;
      });
    }, INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, isPaused, goNext]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      if (e.changedTouches[0].clientY - touchStartY.current > 100) onClose();
      touchStartY.current = null;
    }
  };

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) goPrev();
    else if (x > (rect.width * 2) / 3) goNext();
  };

  const handleSubmitComment = () => {
    if (!commentText.trim() || !currentStory) return;
    commentMutation.mutate({ storyId: currentStory.id, text: commentText.trim() });
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (!currentStory) return null;

  const isTextStory = !currentMedia?.url && currentMedia?.textContent;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.96)" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-testid="story-viewer-overlay"
    >
      <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2 pt-3">
          {stories.map((_, idx) => (
            <div key={idx} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }} data-testid={`story-progress-${idx}`}>
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  background: "#FFFFFF",
                  width: idx < currentIndex ? "100%" : idx === currentIndex ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8" style={{ border: "2px solid rgba(255,255,255,0.5)" }}>
              <AvatarImage src={profileImageUrl} alt={userName} />
              <AvatarFallback style={{ background: "rgba(255,255,255,0.2)", color: "#FFFFFF", fontSize: "12px" }}>
                {userName?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white text-sm font-medium" data-testid="text-story-user">{userName || currentStory.userId}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }} data-testid="text-story-time">{formatTime(currentStory.createdAt)}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center text-white rounded-full"
            style={{ background: "rgba(255,255,255,0.1)" }}
            onClick={onClose}
            data-testid="button-close-story"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 flex items-center justify-center cursor-pointer select-none"
          onClick={handleAreaClick}
          data-testid="story-tap-area"
        >
          {isTextStory ? (
            <div
              className="w-full h-full flex items-center justify-center px-8"
              style={{ background: "#FF6B4A" }}
            >
              <p className="text-white font-bold text-center" style={{ fontSize: "22px", lineHeight: 1.4 }} data-testid={`text-story-content-${currentStory.id}`}>
                {currentMedia?.textContent}
              </p>
            </div>
          ) : currentMedia?.url ? (
            <img src={currentMedia.url} alt={currentMedia.caption || "Story"} className="w-full h-full object-contain" data-testid={`img-story-${currentStory.id}`} />
          ) : null}

          {currentMedia?.caption && !isTextStory && (
            <div className="absolute bottom-28 left-0 right-0 px-4 text-center">
              <p className="text-white text-lg font-medium drop-shadow-lg" data-testid="text-story-caption">{currentMedia.caption}</p>
            </div>
          )}
        </div>

        {currentIndex > 0 && (
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={goPrev}
            data-testid="button-prev-story"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {currentIndex < stories.length - 1 && (
          <button
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={goNext}
            data-testid="button-next-story"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 bg-gradient-to-t from-vf-scrim/80 to-transparent">
          {onInterviewTwin && (
            <button
              className="w-full flex items-center justify-center gap-2 font-semibold mb-3"
              style={{
                background: "#FF6B4A",
                color: "#FFFFFF",
                height: "44px",
                borderRadius: "12px",
                border: "none",
                fontSize: "14px",
                boxShadow: "0 4px 16px rgba(124,58,237,0.45)",
              }}
              onClick={() => { onInterviewTwin(); onClose(); }}
              data-testid="button-interview-twin-from-story"
            >
              <Brain className="w-4 h-4" />
              Interview their Twin
            </button>
          )}
          <div className="flex items-center gap-2 mb-2">
            <button
              className="w-8 h-8 flex items-center justify-center text-white"
              onClick={() => likeMutation.mutate(currentStory.id)}
              disabled={likeMutation.isPending}
              data-testid="button-like-story"
            >
              <Heart className="w-5 h-5" />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center text-white"
              onClick={() => setIsPaused((p) => !p)}
              data-testid="button-comment-story"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
            {currentStory.viewCount !== undefined && (
              <div className="flex items-center gap-1 ml-auto text-xs" style={{ color: "rgba(255,255,255,0.7)" }} data-testid="text-view-count">
                <Eye className="w-4 h-4" />
                <span>{currentStory.viewCount}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Send a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onFocus={() => setIsPaused(true)}
              onBlur={() => setIsPaused(false)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmitComment(); }}
              className="flex-1 text-sm"
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF" }}
              data-testid="input-story-comment"
            />
            <button
              className="w-8 h-8 flex items-center justify-center text-white"
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || commentMutation.isPending}
              data-testid="button-send-comment"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OwnStoryViewerProps {
  stories: OwnStory[];
  onClose: () => void;
  onAddStory: () => void;
  userName?: string;
  profileImageUrl?: string;
}

export function OwnStoryViewer({ stories, onClose, onAddStory, userName, profileImageUrl }: OwnStoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStory = stories[currentIndex];
  const currentMedia = currentStory?.media?.[0];

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/stories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
      onClose();
    },
  });

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((p) => p + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((p) => p - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (isPaused) return;
    const DURATION = 5000;
    const INTERVAL = 50;
    const increment = (INTERVAL / DURATION) * 100;
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) { goNext(); return 0; }
        return prev + increment;
      });
    }, INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, isPaused, goNext]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) goPrev();
    else if (x > (rect.width * 2) / 3) goNext();
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (!currentStory) return null;

  const isTextStory = !currentMedia?.url && currentMedia?.textContent;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.96)" }}
      data-testid="own-story-viewer-overlay"
    >
      <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2 pt-3">
          {stories.map((_, idx) => (
            <div key={idx} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }} data-testid={`own-story-progress-${idx}`}>
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  background: "#FFFFFF",
                  width: idx < currentIndex ? "100%" : idx === currentIndex ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8" style={{ border: "2px solid rgba(255,255,255,0.5)" }}>
              <AvatarImage src={profileImageUrl} alt={userName} />
              <AvatarFallback style={{ background: "rgba(255,255,255,0.2)", color: "#FFFFFF", fontSize: "12px" }}>
                {userName?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white text-sm font-medium" data-testid="text-own-story-label">Your Story</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{formatTime(currentStory.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center text-white rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
              onClick={onAddStory}
              data-testid="button-own-story-add"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center text-white rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
              onClick={onClose}
              data-testid="button-own-story-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 flex items-center justify-center cursor-pointer select-none"
          onClick={handleAreaClick}
          data-testid="own-story-tap-area"
        >
          {isTextStory ? (
            <div
              className="w-full h-full flex items-center justify-center px-8"
              style={{ background: "#FF6B4A" }}
            >
              <p className="text-white font-bold text-center" style={{ fontSize: "22px", lineHeight: 1.4 }} data-testid={`text-own-story-content-${currentStory.id}`}>
                {currentMedia?.textContent}
              </p>
            </div>
          ) : currentMedia?.url ? (
            <img src={currentMedia.url} alt={currentMedia.caption || "Your Story"} className="w-full h-full object-contain" data-testid={`img-own-story-${currentStory.id}`} />
          ) : null}
        </div>

        {currentIndex > 0 && (
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={goPrev}
            data-testid="button-own-story-prev"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {currentIndex < stories.length - 1 && (
          <button
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={goNext}
            data-testid="button-own-story-next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        <div
          className="absolute bottom-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-t from-vf-scrim/80 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 text-white text-sm" data-testid="text-own-story-views">
            <Eye className="w-4 h-4" />
            <span>{currentStory.viewCount} views</span>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold"
            style={{ background: "rgba(239,68,68,0.2)", color: "#F87171", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.3)" }}
            onClick={() => deleteMutation.mutate(currentStory.id)}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-own-story"
          >
            <Trash2 className="w-4 h-4" />
            Delete Story
          </button>
        </div>
      </div>
    </div>
  );
}

type StoryCreatorMode = null | "choose" | "photo-caption" | "text";

interface AddStoryButtonProps {
  onStoryAdded?: () => void;
  mode?: "dashed" | "solid";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddStoryButton({ onStoryAdded, mode = "dashed", open: controlledOpen, onOpenChange }: AddStoryButtonProps) {
  const [creatorMode, setCreatorMode] = useState<StoryCreatorMode>(controlledOpen ? "choose" : null);

  useEffect(() => {
    if (controlledOpen) setCreatorMode("choose");
  }, [controlledOpen]);

  const [caption, setCaption] = useState("");
  const [textContent, setTextContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setCreatorMode("photo-caption");
  };

  const handlePostPhoto = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("media", selectedFile);
      if (caption.trim()) formData.append("caption", caption.trim());
      const res = await fetch("/api/stories", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        toast({ title: "Upload failed", description: "Could not post your story.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
      reset();
      onStoryAdded?.();
    } catch {
      toast({ title: "Upload failed", description: "Could not post your story.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePostText = async () => {
    if (!textContent.trim()) return;
    setIsUploading(true);
    try {
      const res = await fetch("/api/stories/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent: textContent.trim(), caption: caption.trim() || undefined }),
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Post failed", description: "Could not post your text story.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
      reset();
      onStoryAdded?.();
    } catch {
      toast({ title: "Post failed", description: "Could not post your text story.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setCreatorMode(null);
    setCaption("");
    setTextContent("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange?.(false);
  };

  const ringStyle: React.CSSProperties = mode === "solid"
    ? { padding: "2px", borderRadius: "50%", background: "#FF6B4A" }
    : { padding: "2px", borderRadius: "50%", border: "2px dashed rgba(255,107,74,0.5)" };

  const innerStyle: React.CSSProperties = mode === "solid"
    ? { width: "56px", height: "56px", borderRadius: "50%", background: "#161220", display: "flex", alignItems: "center", justifyContent: "center" }
    : { width: "56px", height: "56px", borderRadius: "50%", background: "#161220", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-story-file"
      />

      <div className="flex flex-col items-center gap-1" data-testid="add-story-button-wrapper">
        <button
          style={ringStyle}
          onClick={() => setCreatorMode("choose")}
          disabled={isUploading}
          data-testid="button-add-story"
        >
          <div style={innerStyle}>
            <Plus className="w-5 h-5" style={{ color: "#A79FB4" }} />
          </div>
        </button>
        <span className="text-xs" style={{ color: "#A79FB4" }}>Add a moment</span>
      </div>

      {creatorMode === "choose" && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(12,9,16,0.72)" }}
          onClick={reset}
          data-testid="story-creator-overlay"
        >
          <div
            className="w-full max-w-md p-6 pb-8"
            style={{ background: "#14101C", borderRadius: "26px 26px 0 0", border: "1px solid rgba(255,255,255,0.09)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-center mb-1"
              style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400, color: "#F5F0EA", fontSize: "22px" }}
            >
              Add a moment
            </h2>
            <p className="text-center text-xs mb-6" style={{ color: "#7E7690" }}>
              Only people in your rooms see this.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                className="flex flex-col items-start gap-2 p-4 transition-colors"
                style={{ background: "#161220", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.09)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,107,74,0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
                onClick={() => { fileInputRef.current?.click(); setCreatorMode(null); }}
                data-testid="button-story-choose-photo"
              >
                <Camera className="w-5 h-5" style={{ color: "#A79FB4" }} />
                <p className="font-medium text-sm" style={{ color: "#F5F0EA" }}>A photo</p>
              </button>
              <button
                className="flex flex-col items-start gap-2 p-4 transition-colors"
                style={{ background: "#161220", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.09)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,107,74,0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
                onClick={() => setCreatorMode("text")}
                data-testid="button-story-choose-text"
              >
                <Pencil className="w-5 h-5" style={{ color: "#A79FB4" }} />
                <p className="font-medium text-sm" style={{ color: "#F5F0EA" }}>A line</p>
              </button>
            </div>
            <button
              className="w-full text-sm font-medium"
              style={{ color: "#A79FB4" }}
              onClick={reset}
              data-testid="button-story-creator-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {creatorMode === "photo-caption" && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          data-testid="story-photo-caption-overlay"
        >
          <div
            className="w-full max-w-md p-6 pb-8"
            style={{ background: "#161220", borderRadius: "24px 24px 0 0" }}
          >
            <h2 className="font-bold text-white text-center mb-4" style={{ fontSize: "17px" }}>Add Caption</h2>
            {selectedFile && (
              <div className="flex justify-center mb-4">
                <img
                  src={URL.createObjectURL(selectedFile)}
                  alt="preview"
                  className="max-h-40 rounded-xl object-cover"
                />
              </div>
            )}
            <input
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-4 py-3 text-sm mb-4 text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", outline: "none" }}
              data-testid="input-story-caption"
            />
            <button
              className="w-full py-3 font-semibold text-white mb-3"
              style={{ background: "#FF6B4A", borderRadius: "14px", border: "none", fontSize: "15px" }}
              onClick={handlePostPhoto}
              disabled={isUploading}
              data-testid="button-post-photo-story"
            >
              {isUploading ? "Posting…" : "Post Story"}
            </button>
            <button className="w-full text-sm font-medium" style={{ color: "#A79FB4" }} onClick={reset} data-testid="button-cancel-photo-story">
              Cancel
            </button>
          </div>
        </div>
      )}

      {creatorMode === "text" && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          data-testid="story-text-overlay"
        >
          <div
            className="w-full max-w-md p-6 pb-8"
            style={{ background: "#161220", borderRadius: "24px 24px 0 0" }}
          >
            <h2 className="font-bold text-white text-center mb-4" style={{ fontSize: "17px" }}>Write a Story</h2>
            <textarea
              placeholder="What's on your mind?"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 text-sm mb-3 text-white resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", outline: "none" }}
              data-testid="textarea-story-text"
            />
            <input
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-4 py-3 text-sm mb-4 text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", outline: "none" }}
              data-testid="input-story-text-caption"
            />
            <button
              className="w-full py-3 font-semibold text-white mb-3"
              style={{ background: "#FF6B4A", borderRadius: "14px", border: "none", fontSize: "15px", opacity: textContent.trim() ? 1 : 0.5 }}
              onClick={handlePostText}
              disabled={isUploading || !textContent.trim()}
              data-testid="button-post-text-story"
            >
              {isUploading ? "Posting…" : "Post Story"}
            </button>
            <button className="w-full text-sm font-medium" style={{ color: "#A79FB4" }} onClick={reset} data-testid="button-cancel-text-story">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
