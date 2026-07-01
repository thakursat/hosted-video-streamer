import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, FolderOpen, ChevronRight, Film, Plus, Pencil, Trash2, Move, X, MoreVertical } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { videosApi } from '@/api/videos';
import { cn } from '@/lib/utils';
import type { FolderTree } from '@/types';

const MIN_WIDTH = 150;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 208;

interface SidebarProps {
  selected: string;
  onSelect: (folder: string) => void;
  onCreateFolder: (parent: string) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFolder: (folder: string) => void;
  onMoveFolder: (folder: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface TreeNodeProps {
  node: FolderTree;
  depth: number;
  selected: string;
  onSelect: (folder: string) => void;
  onCreateFolder: (parent: string) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFolder: (folder: string) => void;
  onMoveFolder: (folder: string) => void;
}

function TreeNode({ node, depth, selected, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveFolder }: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0);
  const isRoot = node.path === '';
  const isSelected = node.path === selected;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className="group/node relative flex items-center">
        <button
          onClick={() => { onSelect(node.path); if (hasChildren) setOpen(o => !o); }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-1 text-left text-sm transition-colors',
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
          <span className="shrink-0 text-xs text-text-subtle">{node.totalCount}</span>
        </button>

        {/* Actions menu — always tappable on mobile, hover-reveal on desktop */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={e => e.stopPropagation()}
              title="Folder actions"
              className={cn(
                'absolute right-1 rounded-md bg-surface/90 p-1 text-text-subtle transition-opacity hover:bg-elevated hover:text-text-primary',
                'opacity-100 lg:opacity-0 lg:group-hover/node:opacity-100 data-[state=open]:opacity-100',
              )}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-[60] min-w-40 overflow-hidden rounded-xl border border-border bg-elevated p-1 shadow-xl shadow-black/40 animate-fade-in"
            >
              <DropdownMenu.Item
                onClick={() => onCreateFolder(node.path)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-border"
              >
                <Plus className="h-3.5 w-3.5" /> New subfolder
              </DropdownMenu.Item>
              {!isRoot && (
                <>
                  <DropdownMenu.Item
                    onClick={() => onRenameFolder(node.path)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-border"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onClick={() => onMoveFolder(node.path)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-border"
                  >
                    <Move className="h-3.5 w-3.5" /> Move
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onClick={() => onDeleteFolder(node.path)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger outline-none transition-colors hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path} node={child} depth={depth + 1}
              selected={selected} onSelect={onSelect}
              onCreateFolder={onCreateFolder} onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder} onMoveFolder={onMoveFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeContent({
  tree, selected, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveFolder,
}: Pick<SidebarProps, 'selected' | 'onSelect' | 'onCreateFolder' | 'onRenameFolder' | 'onDeleteFolder' | 'onMoveFolder'> & { tree: FolderTree | undefined }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">Library</p>
        <button
          onClick={() => onCreateFolder('')}
          title="New folder"
          className="rounded-md p-1 text-text-subtle transition-colors hover:bg-elevated hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {tree ? (
        <TreeNode
          node={tree} depth={0} selected={selected} onSelect={onSelect}
          onCreateFolder={onCreateFolder} onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder} onMoveFolder={onMoveFolder}
        />
      ) : (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-elevated" />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  selected, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveFolder,
  mobileOpen, onMobileClose,
}: SidebarProps) {
  const { data: tree } = useQuery({ queryKey: ['tree'], queryFn: videosApi.tree });

  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + e.clientX - startX.current));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setWidth(w => { localStorage.setItem('sidebar-width', String(w)); return w; });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const treeProps = { tree, selected, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveFolder };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="relative hidden shrink-0 flex-col overflow-y-auto border-r border-border lg:flex"
        style={{ width }}
      >
        <TreeContent {...treeProps} />
        <div
          onMouseDown={onDragStart}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors"
        />
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-surface transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">Library</p>
          <button
            onClick={onMobileClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-elevated hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <TreeContent {...treeProps} />
      </aside>
    </>
  );
}
