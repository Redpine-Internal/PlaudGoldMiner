'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Tag, Type } from 'lucide-react';

interface MetadataFormProps {
  initialData?: {
    title?: string;
    type?: 'reuniao' | 'treinamento' | 'informal' | 'outro';
    date?: Date;
    duration?: string;
    tags?: string[];
  };
  suggestedTitle?: string;
  suggestedType?: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  existingTags?: string[];
  onChange: (data: {
    title: string;
    type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
    date: Date;
    duration?: string;
    tags: string[];
  }) => void;
  disabled?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'reuniao', label: 'Reunião', color: 'bg-blue-100 text-blue-800' },
  { value: 'treinamento', label: 'Treinamento', color: 'bg-green-100 text-green-800' },
  { value: 'informal', label: 'Informal', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'outro', label: 'Outro', color: 'bg-gray-100 text-gray-800' },
] as const;

export function MetadataForm({
  initialData,
  suggestedTitle,
  suggestedType,
  existingTags = [],
  onChange,
  disabled = false,
}: MetadataFormProps) {
  const [title, setTitle] = useState(initialData?.title || suggestedTitle || '');
  const [type, setType] = useState<'reuniao' | 'treinamento' | 'informal' | 'outro'>(
    initialData?.type || suggestedType || 'outro'
  );
  const [date, setDate] = useState<string>(
    initialData?.date
      ? initialData.date.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [duration, setDuration] = useState(initialData?.duration || '');
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  // Update when AI suggestions arrive
  useEffect(() => {
    if (suggestedTitle && !title) {
      setTitle(suggestedTitle);
    }
  }, [suggestedTitle, title]);

  useEffect(() => {
    if (suggestedType && type === 'outro') {
      setType(suggestedType);
    }
  }, [suggestedType, type]);

  // Notify parent of changes
  useEffect(() => {
    onChange({
      title,
      type,
      date: new Date(date),
      duration: duration || undefined,
      tags,
    });
  }, [title, type, date, duration, tags, onChange]);

  const filteredTags = existingTags.filter(
    (t) =>
      t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
  );

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
    }
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          <Type className="inline h-4 w-4 mr-1" />
          Título *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Digite o título da conversa"
          className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:border-primary"
          disabled={disabled}
          required
        />
        {suggestedTitle && title !== suggestedTitle && (
          <button
            type="button"
            onClick={() => setTitle(suggestedTitle)}
            className="mt-1 text-xs text-primary hover:underline"
            disabled={disabled}
          >
            Usar sugestão da IA: "{suggestedTitle}"
          </button>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Tipo de Conversa *
        </label>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                type === option.value
                  ? `${option.color} ring-2 ring-offset-2 ring-primary`
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {suggestedType && type !== suggestedType && (
          <button
            type="button"
            onClick={() => setType(suggestedType)}
            className="mt-2 text-xs text-primary hover:underline"
            disabled={disabled}
          >
            Usar sugestão da IA:{' '}
            {TYPE_OPTIONS.find((o) => o.value === suggestedType)?.label}
          </button>
        )}
      </div>

      {/* Date and Duration */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            <Calendar className="inline h-4 w-4 mr-1" />
            Data *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            <Clock className="inline h-4 w-4 mr-1" />
            Duração
          </label>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="ex: 45min"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="relative">
        <label className="block text-sm font-medium text-foreground mb-1">
          <Tag className="inline h-4 w-4 mr-1" />
          Tags
        </label>
        <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-lg bg-background min-h-[42px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-destructive"
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowTagSuggestions(true);
            }}
            onFocus={() => setShowTagSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
            onKeyDown={handleTagKeyDown}
            placeholder={tags.length === 0 ? 'Adicione tags...' : ''}
            className="flex-1 min-w-[100px] outline-none bg-transparent"
            disabled={disabled}
          />
        </div>

        {/* Tag suggestions dropdown */}
        {showTagSuggestions && filteredTags.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
            {filteredTags.slice(0, 5).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
