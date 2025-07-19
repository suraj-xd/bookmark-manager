"use client"

import type React from "react"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  Plus,
  X,
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Copy,
  Trash2,
  Edit,
  Check,
  GripVertical,
  Upload,
  ImageIcon,
  Sparkles,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useInView } from "@/hooks/use-in-view"
import { useRequestQueue } from "@/hooks/use-request-queue"
import { QueueDebug } from "@/components/queue-debug"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// Types
type Bookmark = {
  id: string
  url: string
  title: string
  description: string
  tags: string[]
  categories: string[]
  projectIds: string[]
}

type Project = {
  id: string
  name: string
}

type ViewMode = "grid" | "list"

type MicrolinkData = {
  title: string
  description: string
  image: { url: string }
  logo: { url: string }
}

// Custom Hook for Local Storage
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue
    }
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(error)
      return initialValue
    }
  })

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.error(error)
    }
  }

  return [storedValue, setValue] as const
}

// API Fetcher
const fetchMetadata = async (url: string): Promise<MicrolinkData> => {
  const res = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    throw new Error("Network response was not ok")
  }
  const data = await res.json()
  return {
    title: data.title,
    description: data.description,
    image: { url: data.image },
    logo: { url: data.logo }
  }
}

// AI Tags Fetcher
const fetchAITags = async (bookmark: Bookmark): Promise<{ tags: string[], category: string }> => {
  const res = await fetch('/api/ai-tags', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
    }),
  })
  if (!res.ok) {
    throw new Error('Failed to generate AI tags')
  }
  return res.json()
}

// Components

const BookmarkCardSkeleton = ({ viewMode }: { viewMode: ViewMode }) => {
  if (viewMode === "list") {
    return (
      <div className="flex items-center space-x-4 p-2 border rounded-lg">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    )
  }
  return (
    <Card>
      <CardHeader className="p-0">
        <AspectRatio ratio={16 / 9} className="bg-muted">
          <Skeleton className="w-full h-full" />
        </AspectRatio>
      </CardHeader>
      <CardContent className="p-3">
        <Skeleton className="h-4 w-4/5 mb-2" />
        <Skeleton className="h-3 w-3/5" />
      </CardContent>
    </Card>
  )
}

const EditBookmarkDialog = ({
  bookmark,
  onUpdate,
  children,
}: {
  bookmark: Bookmark
  onUpdate: (details: Partial<Bookmark>) => void
  children: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(bookmark.title)
  const [description, setDescription] = useState(bookmark.description || "")
  const [tags, setTags] = useState(bookmark.tags || [])
  const [tagInput, setTagInput] = useState("")
  const [categories, setCategories] = useState(bookmark.categories || [])
  const [categoryInput, setCategoryInput] = useState("")

  useEffect(() => {
    if (open) {
      setTitle(bookmark.title)
      setDescription(bookmark.description || "")
      setTags(bookmark.tags || [])
      setCategories(bookmark.categories || [])
    }
  }, [open, bookmark])

  const handleAddTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleAddCategory = () => {
    if (categoryInput && !categories.includes(categoryInput)) {
      setCategories([...categories, categoryInput])
      setCategoryInput("")
    }
  }

  const handleRemoveCategory = (categoryToRemove: string) => {
    setCategories(categories.filter((cat) => cat !== categoryToRemove))
  }

  const handleSave = () => {
    // Update available categories in local storage
    categories.forEach(cat => {
      const existingCategories = JSON.parse(window.localStorage.getItem("bm-categories") || "[]")
      const updatedCategories = [...new Set([...existingCategories, cat])]
      window.localStorage.setItem("bm-categories", JSON.stringify(updatedCategories))
    })
    onUpdate({ title, description, tags, categories })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bookmark</DialogTitle>
          <DialogDescription>{bookmark.url}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a description..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="tags" className="text-sm font-medium">
              Tags
            </label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder="Add a tag..."
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="pr-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="categories" className="text-sm font-medium">
              Categories
            </label>
            <div className="flex gap-2">
              <Input
                id="categories"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
                placeholder="Add a category..."
              />
              <Button type="button" variant="outline" onClick={handleAddCategory}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {categories.map((category) => (
                <Badge key={category} variant="outline" className="pr-1">
                  {category}
                  <button
                    onClick={() => handleRemoveCategory(category)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const BookmarkCard = ({
  bookmark,
  onDelete,
  onUpdate,
  viewMode,
  isPreview = false,
}: {
  bookmark: Bookmark
  onDelete: () => void
  onUpdate: (details: Partial<Bookmark>) => void
  viewMode: ViewMode
  isPreview?: boolean
}) => {
  const { enqueueRequest } = useRequestQueue(3) // Max 3 concurrent requests
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: bookmark.id,
    disabled: isPreview,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const {
    data: metadata,
    isLoading,
    isError,
  } = useQuery<MicrolinkData>({
    queryKey: ["metadata", bookmark.url],
    queryFn: () => enqueueRequest(
      `metadata-${bookmark.url}`, 
      () => fetchMetadata(bookmark.url)
    ),
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days - consider data fresh for 7 days
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days - keep in cache for 7 days
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  if (isLoading) {
    return <BookmarkCardSkeleton viewMode={viewMode} />
  }

  const displayTitle = metadata?.title || bookmark.title
  const displayImage = metadata?.image?.url
  const displayLogo = metadata?.logo?.url
  const bookmarkTags = bookmark.tags || []

  const handleGenerateAITags = async () => {
    if (isGeneratingAI) return
    setIsGeneratingAI(true)
    try {
      const aiResult = await fetchAITags(bookmark)
      const updatedTags = [...new Set([...bookmarkTags, ...aiResult.tags])]
      const updatedCategories = bookmark.categories || []
      if (!updatedCategories.includes(aiResult.category)) {
        updatedCategories.push(aiResult.category)
      }
      
      // Update available categories in local storage
      const existingCategories = JSON.parse(window.localStorage.getItem("bm-categories") || "[]")
      const allCategories = [...new Set([...existingCategories, aiResult.category])]
      window.localStorage.setItem("bm-categories", JSON.stringify(allCategories))
      
      onUpdate({
        tags: updatedTags,
        categories: updatedCategories,
      })
    } catch (error) {
      console.error('Failed to generate AI tags:', error)
    } finally {
      setIsGeneratingAI(false)
    }
  }

  if (viewMode === "list") {
    return (
      <Dialog>
        <div ref={setNodeRef} style={style} className="flex items-center bg-card p-2 w-full border rounded-lg">
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTrigger asChild>
            <div className="flex-grow ml-2 cursor-pointer">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={displayLogo || "/placeholder.svg"} />
                  <AvatarFallback>
                    <ImageIcon className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <p className="font-medium truncate">{displayTitle}</p>
              </div>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {bookmark.url}
              </a>
            </div>
          </DialogTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <EditBookmarkDialog bookmark={bookmark} onUpdate={onUpdate}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Edit className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
              </EditBookmarkDialog>
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation()
                  handleGenerateAITags()
                }}
                disabled={isGeneratingAI}
              >
                <Sparkles className={`mr-2 h-4 w-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                <span>{isGeneratingAI ? 'Generating...' : 'AI Tags & Category'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(bookmark.url)
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                <span>Copy URL</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDelete()
                }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DialogContent className="max-w-5xl h-[80vh] p-0">
          <iframe src={bookmark.url} title={displayTitle} className="w-full h-full border-0" loading="lazy" />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog>
      <div ref={setNodeRef} style={style}>
        <Card className="overflow-hidden h-full flex flex-col group relative">
          {/* Drag handle for grid view */}
          <div 
            {...attributes} 
            {...listeners} 
            className="absolute top-2 left-2 z-10 cursor-grab p-1 bg-background/80 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <DialogTrigger asChild>
            <CardHeader className="p-0 cursor-pointer">
              <AspectRatio ratio={16 / 9} className="bg-muted">
                {displayImage && !isError ? (
                  <img
                    src={displayImage || "/placeholder.svg"}
                    alt={displayTitle}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={displayLogo || "/placeholder.svg"} />
                      <AvatarFallback>
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </AspectRatio>
            </CardHeader>
          </DialogTrigger>
          <CardContent className="p-3 flex-grow flex flex-col">
            <div className="flex-grow">
              <p className="font-semibold leading-tight truncate group-hover:underline">{displayTitle}</p>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {bookmark.description || metadata?.description}
              </p>
              {bookmarkTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {bookmarkTags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {(bookmark.categories || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(bookmark.categories || []).map((category) => (
                    <Badge key={category} variant="outline" className="text-xs">
                      {category}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 mt-auto">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={displayLogo || "/placeholder.svg"} />
                  <AvatarFallback>
                    <ImageIcon className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {bookmark.url.replace(/^https?:\/\//, "").split("/")[0]}
                </a>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <EditBookmarkDialog bookmark={bookmark} onUpdate={onUpdate}>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Edit className="mr-2 h-4 w-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                  </EditBookmarkDialog>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGenerateAITags()
                    }}
                    disabled={isGeneratingAI}
                  >
                    <Sparkles className={`mr-2 h-4 w-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingAI ? 'Generating...' : 'AI Tags & Category'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(bookmark.url)
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Copy URL</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onDelete()
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </div>
      <DialogContent className="max-w-5xl h-[80vh] p-0">
        <iframe src={bookmark.url} title={displayTitle} className="w-full h-full border-0" loading="lazy" />
      </DialogContent>
    </Dialog>
  )
}

const LazyBookmarkCard = (
  props: Omit<React.ComponentProps<typeof BookmarkCard>, "onUpdate"> & {
    onUpdate: (id: string, details: Partial<Bookmark>) => void
  },
) => {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref as React.RefObject<Element>)

  const handleUpdate = (details: Partial<Bookmark>) => {
    props.onUpdate(props.bookmark.id, details)
  }

  return (
    <div ref={ref}>
      {isInView ? (
        <BookmarkCard {...props} onUpdate={handleUpdate} />
      ) : (
        <BookmarkCardSkeleton viewMode={props.viewMode} />
      )}
    </div>
  )
}

const SortableTab = ({
  project,
  onRename,
  onClose,
  isActive,
  onClick,
}: {
  project: Project
  onRename: (name: string) => void
  onClose: () => void
  isActive: boolean
  onClick: () => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: project.id,
    disabled: project.id === "all",
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = () => {
    if (project.id !== "all") {
      setIsEditing(true)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }

  const handleSave = () => {
    if (name.trim()) {
      onRename(name.trim())
    } else {
      setName(project.name)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") {
      setName(project.name)
      setIsEditing(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center h-10 px-4 border-b-2 group",
        isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50",
        project.id !== "all" && "pr-2",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-grow h-full flex items-center"
        onClick={onClick}
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-7 w-32"
          />
        ) : (
          <span className="font-medium">{project.name}</span>
        )}
      </div>
      {project.id !== "all" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-2 opacity-50 group-hover:opacity-100"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

const BookmarkPicker = ({
  bookmarks,
  projectBookmarks,
  onUpdate,
}: {
  bookmarks: Bookmark[]
  projectBookmarks: string[]
  onUpdate: (selectedIds: string[]) => void
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(projectBookmarks))
  const [filter, setFilter] = useState("")

  const toggleSelection = (bookmarkId: string) => {
    setSelected((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(bookmarkId)) {
        newSet.delete(bookmarkId)
      } else {
        newSet.add(bookmarkId)
      }
      return newSet
    })
  }

  const filteredBookmarks = bookmarks.filter(
    (b) => b.title.toLowerCase().includes(filter.toLowerCase()) || b.url.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <DialogContent className="max-w-2xl h-[70vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Add Bookmarks to Project</DialogTitle>
      </DialogHeader>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter bookmarks..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex-grow overflow-y-auto -mx-6 px-6">
        <div className="space-y-2">
          {filteredBookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className={cn("flex items-center p-2 cursor-pointer rounded-lg", selected.has(bookmark.id) && "bg-muted")}
              onClick={() => toggleSelection(bookmark.id)}
            >
              <div
                className={cn(
                  "w-4 h-4 border border-primary mr-4 flex items-center justify-center rounded-sm",
                  selected.has(bookmark.id) && "bg-primary",
                )}
              >
                {selected.has(bookmark.id) && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div>
                <p className="font-medium">{bookmark.title}</p>
                <p className="text-sm text-muted-foreground">{bookmark.url}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onUpdate(Array.from(selected))}>Update Project</Button>
      </DialogFooter>
    </DialogContent>
  )
}

export default function BookmarkManagerPage() {
  const [projects, setProjects] = useLocalStorage<Project[]>("bm-projects", [{ id: "all", name: "All Bookmarks" }])
  const [bookmarks, setBookmarks] = useLocalStorage<Bookmark[]>("bm-bookmarks", [])
  const [activeProjectId, setActiveProjectId] = useLocalStorage<string>("bm-activeProject", "all")
  const [viewModes, setViewModes] = useLocalStorage<Record<string, ViewMode>>("bm-viewModes", {})
  const [projectBookmarkOrder, setProjectBookmarkOrder] = useLocalStorage<Record<string, string[]>>(
    "bm-projectBookmarkOrder",
    {},
  )

  const [availableCategories, setAvailableCategories] = useLocalStorage<string[]>("bm-categories", [])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const [search, setSearch] = useState("")
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Derived State
  const activeProject = useMemo(() => {
    const found = projects.find((p) => p.id === activeProjectId)
    if (!found && projects.length > 0) {
      // If the active project is not found, default to "all"
      setActiveProjectId("all")
      return projects.find((p) => p.id === "all") || projects[0]
    }
    return found || projects[0]
  }, [projects, activeProjectId, setActiveProjectId])

  const viewMode = viewModes[activeProject.id] || "grid"

  const displayedBookmarks = useMemo(() => {
    const bookmarksInProject =
      activeProject.id === "all" ? bookmarks : bookmarks.filter((b) => b.projectIds.includes(activeProject.id))

    const filtered = bookmarksInProject.filter((b) => {
      const matchesSearch =
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        b.url.toLowerCase().includes(search.toLowerCase()) ||
        (b.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))

      const matchesCategory =
        selectedCategories.length === 0 || (b.categories || []).some((cat) => selectedCategories.includes(cat))

      return matchesSearch && matchesCategory
    })

    const order = projectBookmarkOrder[activeProject.id] || []
    const ordered = [...filtered].sort((a, b) => {
      const indexA = order.indexOf(a.id)
      const indexB = order.indexOf(b.id)
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })

    return ordered
  }, [bookmarks, activeProject.id, search, projectBookmarkOrder, selectedCategories])

  // Handlers
  const addBookmark = useCallback(
    (url: string, title?: string) => {
      if (!url || !url.startsWith("http")) return
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        url,
        title: title || url,
        description: "",
        tags: [],
        categories: [],
        projectIds: activeProjectId !== "all" ? [activeProjectId] : [],
      }
      setBookmarks((prev) => [newBookmark, ...prev])
      setProjectBookmarkOrder((prev) => {
        const newOrder = { ...prev }
        if (activeProjectId !== "all") {
          newOrder[activeProjectId] = [newBookmark.id, ...(newOrder[activeProjectId] || [])]
        }
        return newOrder
      })
    },
    [activeProjectId, setBookmarks, setProjectBookmarkOrder],
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  const addMultipleBookmarks = useCallback(
    (urls: string[]) => {
      const newBookmarks: Bookmark[] = urls
        .filter((url) => url && url.trim().match(/^https?:\/\//))
        .map((url) => ({
          id: crypto.randomUUID(),
          url: url.trim(),
          title: url.trim(),
          description: "",
          tags: [],
          categories: [],
          projectIds: activeProjectId !== "all" ? [activeProjectId] : [],
        }))

      if (newBookmarks.length === 0) return

      setBookmarks((prev) => [...newBookmarks, ...prev])

      setProjectBookmarkOrder((prev) => {
        const newOrder = { ...prev }
        const newBookmarkIds = newBookmarks.map((b) => b.id)
        if (activeProjectId !== "all") {
          newOrder[activeProjectId] = [...newBookmarkIds, ...(newOrder[activeProjectId] || [])]
        }
        return newOrder
      })
    },
    [activeProjectId, setBookmarks, setProjectBookmarkOrder],
  )

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  const updateBookmarkDetails = (id: string, details: Partial<Bookmark>) => {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, ...details } : b)))
  }

  const addProject = () => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: `New Project ${projects.length}`,
    }
    setProjects((prev) => [...prev, newProject])
    setActiveProjectId(newProject.id)
  }

  const closeProject = (id: string) => {
    if (id === "all") return
    setProjects((prev) => prev.filter((p) => p.id !== id))
    // Also remove bookmarks from this project
    setBookmarks((prev) =>
      prev.map((b) => ({
        ...b,
        projectIds: b.projectIds.filter((pid) => pid !== id),
      })),
    )
    if (activeProjectId === id) {
      setActiveProjectId("all")
    }
  }

  const renameProject = (id: string, newName: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)))
  }

  const updateProjectBookmarks = (selectedIds: string[]) => {
    if (activeProject.id === "all") return
    setBookmarks((prev) =>
      prev.map((b) => {
        const wasInProject = b.projectIds.includes(activeProject.id)
        const shouldBeInProject = selectedIds.includes(b.id)
        if (wasInProject && !shouldBeInProject) {
          return {
            ...b,
            projectIds: b.projectIds.filter((pid) => pid !== activeProject.id),
          }
        }
        if (!wasInProject && shouldBeInProject) {
          return { ...b, projectIds: [...b.projectIds, activeProject.id] }
        }
        return b
      }),
    )
  }

  const setViewMode = (mode: ViewMode) => {
    setViewModes((prev) => ({ ...prev, [activeProject.id]: mode }))
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (text) {
        const urls = text.split(/\r?\n/).filter((line) => line.trim() !== "")
        addMultipleBookmarks(urls)
      }
    }
    reader.readAsText(file)

    if (event.target) {
      event.target.value = ""
    }
  }

  const addCategory = (category: string) => {
    if (category && !availableCategories.includes(category)) {
      setAvailableCategories((prev) => [...prev, category])
    }
  }

  const toggleCategoryFilter = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  const clearCategoryFilters = () => {
    setSelectedCategories([])
  }

  // Effects
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text")
      if (text && text.match(/^https?:\/\//)) {
        e.preventDefault()
        addBookmark(text)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandMenuOpen((open) => !open)
      }
    }

    document.addEventListener("paste", handlePaste)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("paste", handlePaste)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [addBookmark])

  // D&D Handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event

    if (over && active.id !== over.id) {
      // Check if we are dragging a tab or a bookmark
      const isTab = projects.some((p) => p.id === active.id)

      if (isTab) {
        setProjects((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id)
          const newIndex = items.findIndex((item) => item.id === over.id)
          if (items[oldIndex].id === "all" || items[newIndex].id === "all") return items
          const newItems = [...items]
          const [movedItem] = newItems.splice(oldIndex, 1)
          newItems.splice(newIndex, 0, movedItem)
          return newItems
        })
      } else {
        // Bookmark drag
        setProjectBookmarkOrder((prev) => {
          const currentOrder = prev[activeProject.id] || displayedBookmarks.map((b) => b.id)
          const oldIndex = currentOrder.indexOf(active.id as string)
          const newIndex = currentOrder.indexOf(over.id as string)
          const newOrder = [...currentOrder]
          const [movedItem] = newOrder.splice(oldIndex, 1)
          newOrder.splice(newIndex, 0, movedItem)
          return { ...prev, [activeProject.id]: newOrder }
        })
      }
    }
  }

  const activeDragBookmark = useMemo(() => {
    if (!activeDragId) return null
    return bookmarks.find((b) => b.id === activeDragId)
  }, [activeDragId, bookmarks])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-screen bg-background text-foreground font-sans">
        <header className="flex-shrink-0 border-b flex items-center">
          <div className="flex-grow flex items-center overflow-x-auto">
            <SortableContext items={projects.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
              {projects.map((project) => (
                <SortableTab
                  key={project.id}
                  project={project}
                  isActive={project.id === activeProjectId}
                  onClick={() => setActiveProjectId(project.id)}
                  onRename={(name) => renameProject(project.id, name)}
                  onClose={() => closeProject(project.id)}
                />
              ))}
            </SortableContext>
            <Button variant="ghost" size="icon" onClick={addProject}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-grow flex flex-col overflow-hidden">
          <div className="flex-shrink-0 p-4 border-b flex items-center gap-4">
            <div className="flex-grow relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search in ${activeProject.name}... (Cmd+K for global)`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {availableCategories.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Categories:</span>
                <div className="flex flex-wrap gap-1">
                  {availableCategories.map((category) => (
                    <Badge
                      key={category}
                      variant={selectedCategories.includes(category) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategoryFilter(category)}
                    >
                      {category}
                    </Badge>
                  ))}
                  {selectedCategories.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearCategoryFilters} className="h-6 px-2 text-xs">
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
            {activeProject.id !== "all" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Add Bookmarks</Button>
                </DialogTrigger>
                <BookmarkPicker
                  bookmarks={bookmarks}
                  projectBookmarks={bookmarks.filter((b) => b.projectIds.includes(activeProject.id)).map((b) => b.id)}
                  onUpdate={updateProjectBookmarks}
                />
              </Dialog>
            )}
            <Button variant="outline" onClick={handleUploadClick}>
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,text/plain"
            />
            <div className="flex-grow" />
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("grid")}
                className={cn(viewMode === "grid" && "bg-muted")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("list")}
                className={cn(viewMode === "list" && "bg-muted")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto p-4">
            {displayedBookmarks.length > 0 ? (
              <SortableContext items={displayedBookmarks.map((b) => b.id)} strategy={rectSortingStrategy}>
                <div
                  className={cn(
                    viewMode === "grid"
                      ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
                      : "flex flex-col gap-2",
                  )}
                >
                  {displayedBookmarks.map((bookmark) => (
                    <LazyBookmarkCard
                      key={bookmark.id}
                      bookmark={bookmark}
                      onDelete={() => deleteBookmark(bookmark.id)}
                      onUpdate={updateBookmarkDetails}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </SortableContext>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <h3 className="text-lg font-medium">No bookmarks here</h3>
                <p className="max-w-sm">
                  {activeProject.id === "all"
                    ? "Copy a URL and press Cmd+V to add your first bookmark."
                    : 'Click "Add Bookmarks" to populate this project, or paste a URL to add a new one.'}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
      <CommandDialog open={commandMenuOpen} onOpenChange={setCommandMenuOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects.map((p) => (
              <CommandItem
                key={p.id}
                onSelect={() => {
                  setActiveProjectId(p.id)
                  setCommandMenuOpen(false)
                }}
              >
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Bookmarks">
            {bookmarks.map((b) => (
              <CommandItem
                key={b.id}
                onSelect={() => {
                  window.open(b.url, "_blank")
                  setCommandMenuOpen(false)
                }}
              >
                {b.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <DragOverlay>
        {activeDragId && activeDragBookmark ? (
          <BookmarkCard
            bookmark={activeDragBookmark}
            onDelete={() => {}}
            onUpdate={() => {}}
            viewMode={viewMode}
            isPreview={true}
          />
        ) : null}
      </DragOverlay>
      <QueueDebug />
    </DndContext>
  )
}
