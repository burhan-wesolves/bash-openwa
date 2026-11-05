import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Search, Loader2, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { logsApi, type AuditLog, type LogFilters } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';
import { useLogsQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { CustomSelect } from '../components/CustomSelect';
import { pageWindow } from '../utils/pageWindow';
import { fetchAllPages } from '../utils/fetchAllPages';
import { escapeCsvCell } from '../utils/csv';
import './Logs.css';

export function Logs() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  useDocumentTitle(t('logs.title'));
  const [filters, setFilters] = useState<LogFilters>({ sortBy: 'createdAt', sortOrder: 'DESC' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const limit = 20;
  const setFilter = (key: keyof LogFilters, value: string) => {
    setFilters(current => ({ ...current, [key]: value || undefined }));
    setPage(1);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(current => ({ ...current, search: searchInput.trim() || undefined }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const { data, isLoading, isError, refetch, isFetching } = useLogsQuery({ ...filters, page, limit });
  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const activity = (key: string) => t('logs.activity.' + key);
  const select = (key: keyof LogFilters, choices: string[]) => (
    <label className="log-filter-label">
      <span>{activity(key)}</span>
      <CustomSelect
        value={String(filters[key] ?? '')}
        onChange={value => setFilter(key, value)}
        options={choices.map(value => ({ value, label: value ? activity(value) : activity('all') }))}
      />
    </label>
  );
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const snapshot = { ...filters, endDate: filters.endDate ?? new Date().toISOString() };
      const { items, truncated, throttled } = await fetchAllPages<AuditLog>((take, offset) =>
        logsApi.list({ ...snapshot, limit: take, offset }),
      );
      const rows = [...new Map(items.map(log => [log.id, log])).values()];
      if (!rows.length) {
        toast.info(t('logs.exportNoMatches'));
        return;
      }
      const columns = [
        'timestamp',
        'source',
        'action',
        'event',
        'sessionId',
        'webhookId',
        'deliveryId',
        'outcome',
        'attempt',
        'statusCode',
        'durationMs',
        'error',
      ];
      const csv = [
        columns.join(','),
        ...rows.map(log =>
          [
            log.createdAt,
            log.metadata?.source ?? 'audit',
            log.action,
            log.metadata?.event,
            log.sessionId,
            log.metadata?.webhookId,
            log.metadata?.deliveryId,
            log.metadata?.outcome,
            log.metadata?.attempt,
            log.statusCode,
            log.metadata?.durationMs,
            log.errorMessage,
          ]
            .map(value => escapeCsvCell(value == null ? '' : String(value)))
            .join(','),
        ),
      ].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'openwa-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
      link.click();
      URL.revokeObjectURL(url);
      if (truncated)
        toast.warning(
          t(throttled ? 'logs.exportThrottled' : 'logs.exportTruncated', {
            rows: rows.length.toLocaleString(i18n.resolvedLanguage),
          }),
        );
    } catch (error) {
      toast.error(t('logs.exportFailed'), error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="logs-page">
      <PageHeader
        title={t('logs.title')}
        subtitle={activity('subtitle')}
        actions={
          <>
            <button className="btn-secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw size={18} />
              {activity('refresh')}
            </button>
            <button className="btn-secondary" onClick={() => void exportCsv()} disabled={exporting || total === 0}>
              {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {t('logs.exportCsv')}
            </button>
          </>
        }
      />
      {isError && (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} />
          <span>{t('dashboard.loadError')}</span>
        </div>
      )}
      <div className="filters-bar activity-filters">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label={activity('search')}
            placeholder={activity('search')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        {select('source', ['', 'audit', 'event', 'webhook'])}
        {select('severity', ['', 'info', 'warn', 'error'])}
        {select('outcome', ['', 'emitted', 'queued', 'attempting', 'delivered', 'retrying', 'failed', 'skipped'])}
        {select('sortOrder', ['DESC', 'ASC'])}
      </div>
      <details className="log-advanced">
        <summary>{activity('advanced')}</summary>
        <div className="activity-filters">
          {(['event', 'sessionId', 'webhookId', 'deliveryId'] as const).map(key => (
            <label className="log-filter-label" key={key}>
              <span>{activity(key)}</span>
              <input
                defaultValue={String(filters[key] ?? '')}
                onBlur={e => setFilter(key, e.target.value)}
                placeholder={activity(key)}
              />
            </label>
          ))}
          {(['startDate', 'endDate'] as const).map(key => (
            <label className="log-filter-label" key={key}>
              <span>{activity(key)}</span>
              <input
                type="datetime-local"
                onChange={e => setFilter(key, e.target.value ? new Date(e.target.value).toISOString() : '')}
              />
            </label>
          ))}
          {select('sortBy', ['createdAt', 'action', 'severity', 'statusCode'])}
        </div>
      </details>
      <p className="log-results" role="status">
        {activity('total')}: {total.toLocaleString()} · {activity('autoRefresh')}
      </p>
      <div className="logs-table-container">
        <div className="logs-table">
          <div className="table-row header">
            <span>{t('logs.columns.timestamp')}</span>
            <span>{activity('eventAction')}</span>
            <span>{t('logs.columns.session')}</span>
            <span>{activity('source')}</span>
            <span>{activity('result')}</span>
            <span>{t('logs.columns.severity')}</span>
          </div>
          {isLoading && !logs.length ? (
            <div className="empty-table-state">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : !logs.length ? (
            <div className="empty-table-state">
              {isError ? (
                <AlertCircle size={32} />
              ) : (
                <>
                  <FileText size={48} />
                  <h3>{t('logs.empty.title')}</h3>
                  <p>{activity('noMatches')}</p>
                </>
              )}
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="log-entry">
                <div className="table-row">
                  <span className="timestamp">{new Date(log.createdAt).toLocaleString()}</span>
                  <span className="action">
                    {String(log.metadata?.event ?? log.action)}
                    {log.metadata?.event != null && <small>{log.action}</small>}
                  </span>
                  <span className="log-id">{log.sessionName || log.sessionId || '—'}</span>
                  <span>
                    {activity(String(log.metadata?.source ?? 'audit'))}
                    <small>{String(log.metadata?.transport ?? '')}</small>
                  </span>
                  <span>
                    {log.metadata?.outcome ? activity(String(log.metadata.outcome)) : '—'}
                    {log.statusCode ? ' · HTTP ' + log.statusCode : ''}
                    {typeof log.metadata?.attempt === 'number' && (
                      <small>
                        {activity('attempt')}: {log.metadata.attempt}
                      </small>
                    )}
                    {typeof log.metadata?.durationMs === 'number' && <small>{log.metadata.durationMs} ms</small>}
                  </span>
                  <span className={'severity-badge ' + log.severity}>{t('logs.severity.' + log.severity)}</span>
                </div>
                <details className="log-detail">
                  <summary>{activity('details')}</summary>
                  {log.errorMessage && <p className="log-error">{log.errorMessage}</p>}
                  <pre>
                    {JSON.stringify(
                      {
                        id: log.id,
                        action: log.action,
                        sessionId: log.sessionId,
                        apiKeyName: log.apiKeyName,
                        ipAddress: log.ipAddress,
                        method: log.method,
                        path: log.path,
                        statusCode: log.statusCode,
                        ...log.metadata,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            {t('common.previous')}
          </button>
          <span className="page-numbers">
            {pageWindow(page, totalPages).map(p => (
              <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}
