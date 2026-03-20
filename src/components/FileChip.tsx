import { X, FileText, FileSpreadsheet, Image, File } from "lucide-react";

interface FileChipProps {
  file: File;
  onRemove: () => void;
}

const getFileIcon = (type: string) => {
  if (type.includes("pdf")) return <FileText className="w-3.5 h-3.5" />;
  if (type.includes("sheet") || type.includes("csv") || type.includes("excel"))
    return <FileSpreadsheet className="w-3.5 h-3.5" />;
  if (type.includes("image")) return <Image className="w-3.5 h-3.5" />;
  return <File className="w-3.5 h-3.5" />;
};

const FileChip = ({ file, onRemove }: FileChipProps) => {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm border border-border">
      {getFileIcon(file.type)}
      <span className="max-w-[140px] truncate">{file.name}</span>
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
};

export default FileChip;
