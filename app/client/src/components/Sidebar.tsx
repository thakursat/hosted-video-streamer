import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, FolderOpen, ChevronRight, Film } from 'lucide-react';
import { videosApi } from '@/api/videos';
import { cn } from '@/lib/utils';
import type { FolderTree } from '@/types';

interface SidebarProps {
  selected: string;
  onSelect: (folder: string) => void;
}

interface TreeNodeProps {
  node: FolderTree;
  depth: number;
  selected: string;
  onSelect: (folder: string) => void;
}

function TreeNode({ node, depth, selected, onSelect }: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0);
  const isRoot = node.path === '';
  const isSelected = node.path === selected;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => { onSelect(node.path); if (hasChildren) setOpen(o => !o); }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
          isSelected
            ? 'bg-accent-light text-accent-hover font-medium'
            : 'text-text-muted hover:text-text-primary hover:bg-elevated',
        )}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {hasChildren ? (
          <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')} />
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        {isRoot ? (
          <Film className="h-3.5 w-3.5 shrink-0" />
        ) : open && hasChildren ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate">{isRoot ? 'All folders' : node.name}</span>
        <span className="text-xs text-text-subtle">{node.totalCount}</span>
      </button>
      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ selected, onSelect }: SidebarProps) {
  const { data: tree } = useQuery({
    queryKey: ['tree'],
    queryFn: videosApi.tree,
  });

  return (
    <aside className="hidden w-52 shrink-0 border-r border-border lg:flex flex-col overflow-y-auto">
      <div className="p-3">
        <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-text-subtle">Library</p>
        {tree ? (
          <TreeNode node={tree} depth={0} selected={selected} onSelect={onSelect} />
        ) : (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-elevated animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
