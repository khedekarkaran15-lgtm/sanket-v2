import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

interface UploadZoneProps {
  onFilesAdded: (files: File[]) => void;
}

const UploadZone = ({ onFilesAdded }: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFilesAdded(files);
    },
    [onFilesAdded]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length) onFilesAdded(files);
    },
    [onFilesAdded]
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center
        w-full min-h-[35vh] rounded-xl cursor-pointer
        border-2 border-dashed transition-all duration-300
        ${
          isDragging
            ? "border-primary bg-primary/5 shadow-[0_0_40px_hsl(var(--primary)/0.2)]"
            : "border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/[0.02]"
        }
      `}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp"
        onChange={handleFileInput}
        className="sr-only"
      />
      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
      <p className="text-lg font-medium text-foreground/80">
        Drag your research files here
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        PDF · CSV · Excel · Word · Images
      </p>
      <p className="text-xs text-primary/60 mt-3">or click to browse</p>
    </label>
  );
};

export default UploadZone;
