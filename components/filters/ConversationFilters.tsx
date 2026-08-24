'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, Filter, Calendar } from 'lucide-react';

interface FilterState {
  search: string;
  types: string[];
  period: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ConversationFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  resultCount?: number;
}

const TYPE_OPTIONS = [
  { value: 'reuniao', label: 'Reunião' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'informal', label: 'Informal' },
  { value: 'outro', label: 'Outro' },
];

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Período customizado' },
];

export function ConversationFilters({
  onFilterChange,
  resultCount,
}: ConversationFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    types: [],
    period: 'all',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDebounce !== filters.search) {
        setFilters((prev) => ({ ...prev, search: searchDebounce }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDebounce, filters.search]);

  // Notify parent of filter changes
  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleTypeToggle = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  };

  const handlePeriodChange = (period: string) => {
    setFilters((prev) => ({
      ...prev,
      period,
      dateFrom: period === 'custom' ? prev.dateFrom : undefined,
      dateTo: period === 'custom' ? prev.dateTo : undefined,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      types: [],
      period: 'all',
    });
    setSearchDebounce('');
  };

  const hasActiveFilters =
    filters.search ||
    filters.types.length > 0 ||
    filters.period !== 'all';

  return (
    <div className="space-y-4 mb-6">
      {/* Search bar and filter toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchDebounce}
            onChange={(e) => setSearchDebounce(e.target.value)}
            placeholder="Buscar por título ou resumo..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary"
          />
          {searchDebounce && (
            <button
              onClick={() => setSearchDebounce('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${
            showFilters || hasActiveFilters
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:bg-muted'
          }`}
        >
          <Filter className="h-4 w-4" />
          <span className="text-sm">Filtros</span>
          {filters.types.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {filters.types.length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}

        {resultCount !== undefined && (
          <span className="text-sm text-muted-foreground ml-auto">
            {resultCount} conversa{resultCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="p-4 border border-border rounded-lg bg-sidebar space-y-4">
          {/* Type filter */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Tipo de Conversa
            </label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleTypeToggle(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    filters.types.includes(option.value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Período</label>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handlePeriodChange(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    filters.period === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          {filters.period === 'custom' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                  className="px-3 py-1.5 border border-border rounded-lg text-sm"
                />
              </div>
              <span className="text-muted-foreground">até</span>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                className="px-3 py-1.5 border border-border rounded-lg text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
