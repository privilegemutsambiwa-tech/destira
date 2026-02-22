import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, MessageCircle, X, Plus, Eye, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface StoryData {
  id: number;
  userId: string;
  createdAt: string;
  expiresAt: string;
  media: { id: number; type: string; url: string; caption?: string }[];
  likeCount?: number;
  viewCount?: number;
}

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
        className={`rounded-full p-[2px] ${
          hasUnviewed
            ? "bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-400"
            : "bg-muted-foreground/30"
        }`}
      >
        <div className="rounded-full p-[2px] bg-background">
          <Avatar className="w-14 h-14">
            <AvatarImage src={profileImageUrl} alt={userName} />
            <AvatarFallback className="text-sm font-semibold">
              {userName?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[64px]" data-testid={`text-story-name-${userId}`}>
        {userName}
      </span>
    </button>
  );
}

interface StoryViewerProps {
  stories: StoryData[];
  initialIndex: number;
  onClose: () => void;
}

export function StoryViewer({ stories, initialIndex, onClose }: StoryViewerProps) {
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
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ storyId, text }: { storyId: number; text: string }) => {
      await apiRequest("POST", `/api/stories/${storyId}/comment`, { text });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    },
  });

  const viewMutation = useMutation({
    mutationFn: async (storyId: number) => {
      await apiRequest("POST", `/api/stories/${storyId}/view`);
    },
  });

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
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
        if (prev >= 100) {
          goNext();
          return 0;
        }
        return prev + increment;
      });
    }, INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, isPaused, goNext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY > 100) {
        onClose();
      }
      touchStartY.current = null;
    }
  };

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 3) {
      goPrev();
    } else if (clickX > (rect.width * 2) / 3) {
      goNext();
    }
  };

  const handleSubmitComment = () => {
    if (!commentText.trim() || !currentStory) return;
    commentMutation.mutate({ storyId: currentStory.id, text: commentText.trim() });
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  };

  if (!currentStory) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-testid="story-viewer-overlay"
    >
      <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2 pt-3">
          {stories.map((_, idx) => (
            <div
              key={idx}
              className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden"
              data-testid={`story-progress-${idx}`}
            >
              <div
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{
                  width:
                    idx < currentIndex
                      ? "100%"
                      : idx === currentIndex
                      ? `${progress}%`
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8 border-2 border-white/50">
              <AvatarImage src={undefined} alt="User" />
              <AvatarFallback className="text-xs bg-white/20 text-white">
                {currentStory.userId?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white text-sm font-medium" data-testid="text-story-user">
                {currentStory.userId}
              </p>
              <p className="text-white/60 text-xs" data-testid="text-story-time">
                {formatTimestamp(currentStory.createdAt)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={onClose}
            data-testid="button-close-story"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div
          className="flex-1 flex items-center justify-center cursor-pointer select-none"
          onClick={handleAreaClick}
          data-testid="story-tap-area"
        >
          {currentMedia && (
            <img
              src={currentMedia.url}
              alt={currentMedia.caption || "Story"}
              className="w-full h-full object-contain"
              data-testid={`img-story-${currentStory.id}`}
            />
          )}
          {currentMedia?.caption && (
            <div className="absolute bottom-28 left-0 right-0 px-4 text-center">
              <p className="text-white text-lg font-medium drop-shadow-lg" data-testid="text-story-caption">
                {currentMedia.caption}
              </p>
            </div>
          )}
        </div>

        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:bg-white/10"
              onClick={goPrev}
              data-testid="button-prev-story"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
          )}
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
          {currentIndex < stories.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:bg-white/10"
              onClick={goNext}
              data-testid="button-next-story"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 bg-gradient-to-t from-black/60 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => likeMutation.mutate(currentStory.id)}
              disabled={likeMutation.isPending}
              data-testid="button-like-story"
            >
              <Heart className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setIsPaused((p) => !p)}
              data-testid="button-comment-story"
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            {currentStory.viewCount !== undefined && (
              <div className="flex items-center gap-1 text-white/70 text-xs ml-auto" data-testid="text-view-count">
                <Eye className="w-4 h-4" />
                <span>{currentStory.viewCount}</span>
              </div>
            )}
            {currentStory.likeCount !== undefined && currentStory.likeCount > 0 && (
              <div className="flex items-center gap-1 text-white/70 text-xs" data-testid="text-like-count">
                <Heart className="w-4 h-4" />
                <span>{currentStory.likeCount}</span>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitComment();
              }}
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 text-sm"
              data-testid="input-story-comment"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || commentMutation.isPending}
              data-testid="button-send-comment"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AddStoryButtonProps {
  onStoryAdded?: () => void;
}

export function AddStoryButton({ onStoryAdded }: AddStoryButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCaptionInput, setShowCaptionInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setShowCaptionInput(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("media", selectedFile);
      if (caption.trim()) {
        formData.append("caption", caption.trim());
      }
      await fetch("/api/stories", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      setSelectedFile(null);
      setCaption("");
      setShowCaptionInput(false);
      onStoryAdded?.();
    } catch (err) {
      console.error("Failed to upload story:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setCaption("");
    setShowCaptionInput(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-story-file"
      />

      {showCaptionInput ? (
        <div className="flex flex-col items-center gap-2 p-3 rounded-md bg-card border">
          <p className="text-xs text-muted-foreground">Add a caption (optional)</p>
          <Input
            placeholder="Caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="text-sm"
            data-testid="input-story-caption"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              data-testid="button-cancel-story"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={isUploading}
              data-testid="button-upload-story"
            >
              {isUploading ? "Uploading..." : "Post"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover-elevate active-elevate-2 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid="button-add-story"
        >
          {isUploading ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus className="w-6 h-6 text-muted-foreground" />
          )}
        </button>
      )}
      <span className="text-xs text-muted-foreground">Add Story</span>
    </div>
  );
}
