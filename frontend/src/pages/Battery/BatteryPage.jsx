import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Form, Select, Input, InputNumber, DatePicker, Button, Table, Tabs,
  Badge, notification, Tooltip, Space, Row, Col, Divider, Tag, Checkbox,
  Typography, Upload, Collapse, Modal, Popover, Radio,
} from 'antd';
import {
  ReloadOutlined, DownloadOutlined, DeleteOutlined, PlayCircleOutlined,
  StopOutlined, DisconnectOutlined, ApiOutlined, InboxOutlined, QuestionCircleOutlined,
  ExportOutlined, FullscreenOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { useLang } from '../../contexts/LangContext';
import { uploadTemplate, getTemplateInfo, downloadReportFromTemplate, uploadArchive, getArchiveInfo, downloadArchiveReport } from '../../api/battery';

const { Title } = Typography;
const { Option } = Select;

const STATUS_COLORS = {
  'Waiting...': '#ffffff',
  'Testing...': '#00e5ff',
  'Done': '#69f0ae',
  'Remove': '#69f0ae',
  'Saving...': '#ffee58',
  'Stopped': '#9e9e9e',
  'Error': '#ef5350',
};

function getStatusColor(text) {
  if (!text) return '#ffffff';
  for (const [key, color] of Object.entries(STATUS_COLORS)) {
    if (text.includes(key)) return color;
  }
  return '#ffffff';
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const OCV_TOLERANCE = 0.003;
const CCV_TOLERANCE = 0.010;
const Y_AXIS_PADDING_RATIO = 0.1;
const MIN_Y_AXIS_PADDING = 0.01;
const ZOOM_MODAL_TABLE_SCROLL_Y = 'calc(80vh - 120px)';
const ZOOM_CHART_DATA_ZOOM = [{ type: 'inside', filterMode: 'none' }, { type: 'slider', height: 20, bottom: 4 }];

function parseStandard(str) {
  if (!str || !str.trim()) return null;
  const cleaned = str.replace(/\+\/-/g, '±').replace(/\s/g, '');
  const matchFull = cleaned.match(/^([0-9.]+)±([0-9.]+)$/);
  if (matchFull) {
    return { center: parseFloat(matchFull[1]), tolerance: parseFloat(matchFull[2]) };
  }
  const matchSimple = cleaned.match(/^([0-9.]+)$/);
  if (matchSimple) {
    return { center: parseFloat(matchSimple[1]), tolerance: 0 };
  }
  return null;
}

function getInitialSession() {
  try {
    return JSON.parse(localStorage.getItem('battery_session') || '{}');
  } catch {
    return {};
  }
}

function RowWithPopover({ record, readingsByBattery, buildMiniChartOption, ...rowProps }) {
  const hasReadings = record && readingsByBattery && (readingsByBattery[record.id] || []).length > 0;
  if (!hasReadings) {
    return <tr {...rowProps} />;
  }
  const popoverContent = (
    <div style={{ width: 900, background: '#1a1a1a', borderRadius: 6, padding: 4 }}>
      <ReactECharts
        option={buildMiniChartOption(record.id)}
        style={{ height: 450, width: 900 }}
        notMerge
        theme="dark"
      />
    </div>
  );
  return (
    <Popover
      content={popoverContent}
      overlayInnerStyle={{ background: '#1a1a1a', padding: 0 }}
      overlayStyle={{ maxWidth: 940 }}
      placement="left"
      mouseEnterDelay={0.3}
    >
      <tr {...rowProps} />
    </Popover>
  );
}

export default function BatteryPage() {
  const { t, lang } = useLang();

  // Connection state
  const [ports, setPorts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Test state
  const [running, setRunning] = useState(false);

  // Form params
  const [port, setPort] = useState('');
  const [baudRate, setBaudRate] = useState(115200);
  const [simMode, setSimMode] = useState(false);
  const [orderId, setOrderId] = useState(() => getInitialSession().orderId || '');
  const [testDate, setTestDate] = useState(() => {
    const saved = getInitialSession();
    return saved.testDate ? dayjs(saved.testDate) : dayjs();
  });
  const [resistance, setResistance] = useState(3.9);
  const [ocvTime, setOcvTime] = useState(1);
  const [loadTime, setLoadTime] = useState(0.3);
  const [kCoeff, setKCoeff] = useState(1.0);
  const [batteryType, setBatteryType] = useState(() => getInitialSession().batteryType || 'LR6');
  const [productLine, setProductLine] = useState(() => getInitialSession().productLine || 'UD+');
  const [ocvCenter, setOcvCenter] = useState(() => getInitialSession().ocvCenter ?? null);
  const [ccvCenter, setCcvCenter] = useState(() => getInitialSession().ccvCenter ?? null);

  // Display
  const [statusText, setStatusText] = useState('Waiting...');
  const [statusColor, setStatusColor] = useState('#ffffff');

  // Chart
  const [chartData, setChartData] = useState(() => getInitialSession().chartData || []);
  const [chartDataOCV, setChartDataOCV] = useState(() => getInitialSession().chartDataOCV || []);
  const [chartDataCCV, setChartDataCCV] = useState(() => getInitialSession().chartDataCCV || []);
  const [chartSeriesByBattery, setChartSeriesByBattery] = useState(() => getInitialSession().chartSeriesByBattery || {});
  const [autoScroll, setAutoScroll] = useState(true);
  const [legendSelected, setLegendSelected] = useState({ OCV: true, CCV: true });

  // Results
  const [records, setRecords] = useState(() => getInitialSession().records || []);

  // Physical dimensions (caliper)
  const [caliperPhase, setCaliperPhase] = useState(false); // true after OCV/CCV is done
  const [caliperSingleMode, setCaliperSingleMode] = useState(false); // true when measuring only one battery
  const [caliperDia, setCaliperDia] = useState('');
  const [caliperHei, setCaliperHei] = useState('');
  const [caliperBuffer, setCaliperBuffer] = useState('');
  const [caliperMode, setCaliperMode] = useState('dia'); // 'dia' | 'hei'
  const [caliperIndex, setCaliperIndex] = useState(0); // index of battery currently being measured
  const caliperInputRef = useRef(null);
  // Refs to access current caliper values inside WS callback without stale closures
  const caliperDiaRef = useRef('');
  const caliperHeiRef = useRef('');
  const caliperIndexRef = useRef(0);
  const caliperSingleModeRef = useRef(false);
  const recordsLengthRef = useRef(0);
  const recordsRef = useRef([]);
  useEffect(() => { caliperDiaRef.current = caliperDia; }, [caliperDia]);
  useEffect(() => { caliperHeiRef.current = caliperHei; }, [caliperHei]);
  useEffect(() => { caliperIndexRef.current = caliperIndex; }, [caliperIndex]);
  useEffect(() => { caliperSingleModeRef.current = caliperSingleMode; }, [caliperSingleMode]);
  useEffect(() => { recordsLengthRef.current = records.length; recordsRef.current = records; }, [records]);

  // Readings grouped by battery id for mini chart popover
  const [readingsByBattery, setReadingsByBattery] = useState(() => getInitialSession().readingsByBattery || {});

  // History tab — persistent across reloads via localStorage
  const [historyRecords, setHistoryRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('battery_history') || '[]');
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState('results');
  const [chartZoomVisible, setChartZoomVisible] = useState(false);
  const [tableZoomVisible, setTableZoomVisible] = useState(false);

  // History tab filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyLineFilter, setHistoryLineFilter] = useState('');

  // Resume session modal
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [savedSessionInfo, setSavedSessionInfo] = useState(null);

  // Order ID change warning modal
  const [orderIdChangeModalVisible, setOrderIdChangeModalVisible] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState('');

  // Excel report template
  const [templateName, setTemplateName] = useState(() => localStorage.getItem('battery_template_name') || null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Archive
  const [archiveName, setArchiveName] = useState(() => localStorage.getItem('battery_archive_name') || null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);

  // WebSocket
  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingNewSessionRef = useRef(false);
  const orderIdRef = useRef(orderId);
  useEffect(() => { orderIdRef.current = orderId; }, [orderId]);
  const batteryTypeRef = useRef(batteryType);
  useEffect(() => { batteryTypeRef.current = batteryType; }, [batteryType]);
  const productLineRef = useRef(productLine);
  useEffect(() => { productLineRef.current = productLine; }, [productLine]);

  // Caliper HID input handler — captures keystrokes from USB wireless receiver
  useEffect(() => {
    const handleCaliperKey = (e) => {
      // Skip if caliper phase is not active
      if (!caliperPhase) return;
      // Skip if a real input/textarea/select is focused
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Enter') {
        const val = parseFloat(caliperBuffer.replace(',', '.'));
        if (!isNaN(val) && val > 0) {
          if (caliperMode === 'dia') {
            setCaliperDia(val.toFixed(2));
            setCaliperMode('hei'); // auto switch to next measurement
          } else {
            // Hei done — auto-save to current record index
            const heiVal = val.toFixed(2);
            const idx = caliperIndexRef.current;
            const diaVal = caliperDiaRef.current;
            setRecords(prev => {
              if (idx >= prev.length) return prev;
              const updated = [...prev];
              const rec = { ...updated[idx] };
              if (diaVal !== '') rec.dia = parseFloat(diaVal);
              rec.hei = parseFloat(heiVal);
              updated[idx] = rec;
              return updated;
            });
            // Also patch the matching history entry so Lịch sử tab shows real values
            const recordId = recordsRef.current[idx]?.id;
            if (recordId !== undefined) {
              setHistoryRecords(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].id === recordId && updated[i]._orderId === orderIdRef.current) {
                    const patched = { ...updated[i] };
                    if (diaVal !== '') patched.dia = parseFloat(diaVal);
                    patched.hei = parseFloat(heiVal);
                    updated[i] = patched;
                    break;
                  }
                }
                try { localStorage.setItem('battery_history', JSON.stringify(updated.slice(-500))); } catch {}
                return updated.slice(-500);
              });
            }
            if (caliperSingleModeRef.current) {
              // Single mode — stop after measuring one battery
              setCaliperPhase(false);
              setCaliperBuffer('');
              setCaliperDia('');
              setCaliperHei('');
              setCaliperMode('dia');
              setCaliperSingleMode(false);
            } else {
              const nextIdx = idx + 1;
              setCaliperIndex(nextIdx);
              setCaliperDia('');
              setCaliperHei('');
              setCaliperMode('dia');
              if (nextIdx >= recordsLengthRef.current) {
                // All batteries measured
                setCaliperPhase(false);
                setCaliperBuffer('');
              }
            }
          }
        }
        setCaliperBuffer('');
      } else if (/^[\d]$/.test(e.key)) {
        setCaliperBuffer((prev) => prev + e.key);
      } else if ((e.key === '.' || e.key === ',') && !/[.,]/.test(caliperBuffer)) {
        // Only allow one decimal separator
        setCaliperBuffer((prev) => prev + e.key);
      }
    };
    window.addEventListener('keydown', handleCaliperKey);
    return () => window.removeEventListener('keydown', handleCaliperKey);
  }, [caliperBuffer, caliperMode, caliperPhase]);

  const buildParams = useCallback(() => ({
    order_id: orderId,
    date: testDate ? testDate.format('YYYY-MM') : dayjs().format('YYYY-MM'),
    resistance: parseFloat(resistance),
    ocv_time: parseFloat(ocvTime),
    load_time: parseFloat(loadTime),
    coeff: parseFloat(kCoeff),
    battery_type: batteryType,
    product_line: productLine,
    ocv_standard: ocvCenter,
    ccv_standard: ccvCenter,
  }), [orderId, testDate, resistance, ocvTime, loadTime, kCoeff, batteryType, productLine, ocvCenter, ccvCenter]);

  const sendMsg = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const handleWsMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ports':
        setPorts(msg.ports || []);
        break;

      case 'connect_result':
        setConnecting(false);
        if (msg.ok) {
          setConnected(true);
          notification.success({ message: t('batteryConnectSuccess'), description: msg.message });
        } else {
          setConnected(false);
          notification.error({ message: t('batteryConnectFailed'), description: msg.message });
        }
        break;

      case 'disconnected':
        setConnected(false);
        setRunning(false);
        setStatusText('Waiting...');
        setStatusColor('#ffffff');
        break;

      case 'test_started':
        setRunning(true);
        setStatusText('Testing...');
        setStatusColor(getStatusColor('Testing...'));
        notification.info({ message: t('batteryTestStarted') });
        break;

      case 'test_stopped':
        setRunning(false);
        setStatusText('Stopped');
        setStatusColor(getStatusColor('Stopped'));
        notification.info({ message: t('batteryTestStopped') });
        break;

      case 'reading':
        if (msg.elapsed !== undefined && msg.voltage !== undefined) {
          setChartData((prev) => [...prev, [msg.elapsed, msg.voltage]]);
          if (msg.phase === 'ocv') {
            setChartDataOCV((prev) => [...prev, [msg.elapsed, msg.voltage]]);
          } else if (msg.phase === 'ccv') {
            setChartDataCCV((prev) => [...prev, [msg.elapsed, msg.voltage]]);
          }
          if (msg.battery_id !== undefined) {
            const bid = msg.battery_id;
            setReadingsByBattery((prev) => {
              const id = bid;
              const list = prev[id] || [];
              return { ...prev, [id]: [...list, { t: msg.elapsed, v: msg.voltage, phase: msg.phase }] };
            });
            setChartSeriesByBattery((prev) => {
              const entry = prev[bid] || { ocv: [], ccv: [] };
              const point = [msg.elapsed, msg.voltage];
              if (msg.phase === 'ocv') {
                return { ...prev, [bid]: { ...entry, ocv: [...entry.ocv, point] } };
              } else if (msg.phase === 'ccv') {
                return { ...prev, [bid]: { ...entry, ccv: [...entry.ccv, point] } };
              }
              return prev;
            });
          }
        }
        break;

      case 'record':
        if (msg.record) {
          const dia = caliperDiaRef.current || null;
          const hei = caliperHeiRef.current || null;
          const enrichedRecord = { ...msg.record, dia: dia ? parseFloat(dia) : null, hei: hei ? parseFloat(hei) : null };
          setRecords((prev) => {
            const idx = prev.findIndex((r) => r.id === msg.record.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = enrichedRecord;
              return updated;
            }
            return [...prev, enrichedRecord];
          });
          setHistoryRecords((prev) => {
            const localeMap = { vi: 'vi-VN', en: 'en-US', zh: 'zh-CN' };
            const dateLocale = localeMap[lang] || lang;
            const entry = {
              ...enrichedRecord,
              _session: new Date().toLocaleDateString(dateLocale),
              _isoDate: dayjs().format('YYYY-MM-DD'),
              _orderId: orderIdRef.current,
              _batteryType: batteryTypeRef.current,
              _productLine: productLineRef.current,
            };
            const next = [...prev, entry];
            try { localStorage.setItem('battery_history', JSON.stringify(next.slice(-500))); } catch {}
            return next.slice(-500);
          });
          // Reset caliper values after saving to record
          setCaliperDia('');
          setCaliperHei('');
        }
        break;

      case 'status':
        if (msg.text) {
          setStatusText(msg.text);
          setStatusColor(getStatusColor(msg.text));
        } else if (msg.data) {
          const text = msg.data.status_text || 'Waiting...';
          setStatusText(text);
          setStatusColor(getStatusColor(text));
          if (msg.data.records) setRecords(msg.data.records);
        }
        break;

      case 'session_cleared':
        setChartData([]);
        setChartDataOCV([]);
        setChartDataCCV([]);
        setChartSeriesByBattery({});
        setRecords([]);
        setReadingsByBattery({});
        notification.success({ message: t('batterySessionCleared') });
        break;

      case 'error':
        notification.error({ message: t('error'), description: msg.message });
        break;

      default:
        break;
    }
  }, [t]);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    const token = localStorage.getItem('accessToken') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws/battery?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      // Request available ports immediately
      ws.send(JSON.stringify({ action: 'get_ports' }));
      if (pendingNewSessionRef.current) {
        try {
          ws.send(JSON.stringify({ action: 'clear_session' }));
          pendingNewSessionRef.current = false;
        } catch {
          // flag remains true; will retry on next connection
        }
      }
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = (evt) => {
      if (!mountedRef.current) return;
      // If closed unexpectedly and we were connected/running, attempt reconnect
      if (evt.code !== 1000 && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(connectWs, RETRY_DELAY_MS);
      }
    };

    ws.onerror = () => {
      // error will be followed by close
    };
  }, [handleWsMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'unmount');
      }
    };
  }, [connectWs]);

  // Refresh port list
  const handleRefreshPorts = () => {
    sendMsg({ action: 'get_ports' });
  };

  // Connect to device
  const handleConnect = () => {
    if (!simMode && !port) {
      notification.warning({ message: t('batterySelectPort') });
      return;
    }
    setConnecting(true);
    sendMsg({
      action: 'connect',
      payload: { port: simMode ? null : port, baud_rate: baudRate, simulation: simMode },
    });
  };

  // Disconnect
  const handleDisconnect = () => {
    sendMsg({ action: 'disconnect' });
  };

  // Start / stop test
  const handleStartStop = () => {
    if (running) {
      sendMsg({ action: 'stop' });
    } else {
      sendMsg({ action: 'start', payload: buildParams() });
    }
  };

  // Retest a specific record
  const handleRetest = (record) => {
    sendMsg({ action: 'start', payload: { ...buildParams(), retest_id: record.id } });
  };

  // Clear session
  const handleClearSession = () => {
    sendMsg({ action: 'clear_session' });
    localStorage.removeItem('battery_session');
    setReadingsByBattery({});
    setChartSeriesByBattery({});
  };

  // Skip current battery (advance without saving dimensions)
  const handleSaveCaliper = useCallback(() => {
    if (caliperSingleMode) {
      // Single mode: just exit
      setCaliperPhase(false);
      setCaliperDia('');
      setCaliperHei('');
      setCaliperBuffer('');
      setCaliperMode('dia');
      setCaliperSingleMode(false);
      return;
    }
    const nextIdx = caliperIndex + 1;
    setCaliperIndex(nextIdx);
    setCaliperDia('');
    setCaliperHei('');
    setCaliperBuffer('');
    setCaliperMode('dia');
    if (nextIdx >= records.length) {
      setCaliperPhase(false);
    }
  }, [caliperSingleMode, caliperIndex, records.length]);

  const handleResetCaliper = useCallback(() => {
    setCaliperPhase(false);
    setCaliperDia('');
    setCaliperHei('');
    setCaliperBuffer('');
  }, []);

  // Template upload handler
  const handleTemplateUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('template', file);
    try {
      await uploadTemplate(formData);
      setTemplateName(file.name);
      localStorage.setItem('battery_template_name', file.name);
      notification.success({ message: t('batteryTemplateUploaded') });
      onSuccess();
    } catch (e) {
      notification.error({ message: t('batteryTemplateUploadFailed'), description: e.message });
      onError(e);
    }
  };

  // Archive upload handler
  const handleArchiveUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('archive', file);
    try {
      await uploadArchive(formData);
      setArchiveName(file.name);
      localStorage.setItem('battery_archive_name', file.name);
      notification.success({ message: t('batteryArchiveUploaded') });
      onSuccess();
    } catch (e) {
      notification.error({ message: t('batteryArchiveUploadFailed'), description: e.message });
      onError(e);
    }
  };

  // Download report from template
  const handleDownloadTemplateReport = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await downloadReportFromTemplate(records);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = testDate ? testDate.format('YYYY-MM') : dayjs().format('YYYY-MM');
      link.download = `battery_report_${orderId}_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notification.success({ message: t('batteryDownloadSuccess') });
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) {
        notification.warning({ message: t('batteryTemplateNotFound') });
      } else {
        let errMsg = e.message;
        if (e.response?.data instanceof Blob) {
          try {
            const text = await e.response.data.text();
            const parsed = JSON.parse(text);
            errMsg = parsed.error || parsed.detail || errMsg;
          } catch (_parseErr) { /* blob is not JSON, keep original message */ }
        }
        notification.error({ message: t('batteryDownloadFailed'), description: errMsg });
      }
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Download archive report
  const handleDownloadArchiveReport = async () => {
    setDownloadingArchive(true);
    try {
      const response = await downloadArchiveReport(records);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = testDate ? testDate.format('YYYY-MM') : dayjs().format('YYYY-MM');
      link.download = `battery_archive_${orderId}_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notification.success({ message: t('batteryDownloadSuccess') });
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) {
        notification.warning({ message: t('batteryArchiveNotFound') });
      } else {
        let errMsg = e.message;
        if (e.response?.data instanceof Blob) {
          try {
            const text = await e.response.data.text();
            const parsed = JSON.parse(text);
            errMsg = parsed.error || parsed.detail || errMsg;
          } catch (_parseErr) { /* blob is not JSON, keep original message */ }
        }
        notification.error({ message: t('batteryDownloadFailed'), description: errMsg });
      }
    } finally {
      setDownloadingArchive(false);
    }
  };

  // ECharts option — one series per battery (OCV + CCV connected)
  const allBatteryIds = Object.keys(chartSeriesByBattery).map(Number).sort((a, b) => a - b);
  const chartSeries = [];
  allBatteryIds.forEach((bid, idx) => {
    const { ocv = [], ccv = [] } = chartSeriesByBattery[bid];
    const isFirst = idx === 0;
    chartSeries.push({
      name: 'OCV',
      type: 'line',
      data: ocv,
      symbol: 'none',
      lineStyle: { color: '#ffee58', width: 2 },
      markArea: isFirst && ocv.length > 0 && ocvTime > 0 ? {
        silent: true,
        data: [[
          { name: 'OCV', xAxis: 0, itemStyle: { color: 'rgba(255,238,88,0.08)' } },
          { xAxis: ocvTime },
        ]],
      } : undefined,
    });
    const ccvConnected = ocv.length > 0 && ccv.length > 0
      ? [ocv[ocv.length - 1], ...ccv]
      : ccv;
    chartSeries.push({
      name: 'CCV',
      type: 'line',
      data: ccvConnected,
      symbol: 'none',
      lineStyle: { color: '#0091ea', width: 2 },
      areaStyle: isFirst ? { color: 'rgba(0,145,234,0.08)' } : undefined,
      markArea: isFirst && ocv.length > 0 && ocvTime > 0 ? {
        silent: true,
        data: [[
          { name: 'Load', xAxis: ocvTime, itemStyle: { color: 'rgba(0,229,255,0.06)' } },
          { xAxis: ocvTime + loadTime },
        ]],
      } : undefined,
    });
  });
  // Fallback to legacy flat data when chartSeriesByBattery is empty (e.g. resumed session without per-battery data)
  if (allBatteryIds.length === 0 && (chartDataOCV.length > 0 || chartDataCCV.length > 0)) {
    chartSeries.push({
      name: 'OCV',
      type: 'line',
      data: chartDataOCV,
      symbol: 'none',
      lineStyle: { color: '#ffee58', width: 2 },
      markArea: (chartDataOCV.length > 0 || chartDataCCV.length > 0) && ocvTime > 0 ? {
        silent: true,
        data: [[
          { name: 'OCV', xAxis: 0, itemStyle: { color: 'rgba(255,238,88,0.08)' } },
          { xAxis: ocvTime },
        ]],
      } : undefined,
    });
    chartSeries.push({
      name: 'CCV',
      type: 'line',
      data: chartDataOCV.length > 0 && chartDataCCV.length > 0
        ? [chartDataOCV[chartDataOCV.length - 1], ...chartDataCCV]
        : chartDataCCV,
      symbol: 'none',
      lineStyle: { color: '#0091ea', width: 2 },
      areaStyle: { color: 'rgba(0,145,234,0.08)' },
      markArea: (chartDataOCV.length > 0 || chartDataCCV.length > 0) && ocvTime > 0 ? {
        silent: true,
        data: [[
          { name: 'Load', xAxis: ocvTime, itemStyle: { color: 'rgba(0,229,255,0.06)' } },
          { xAxis: ocvTime + loadTime },
        ]],
      } : undefined,
    });
  }
  // Compute explicit Y-axis bounds from only the visible series so that hiding
  // either OCV or CCV always triggers a proper rescale (ECharts' built-in
  // scale:true is unreliable when the first-defined series is toggled off).
  const yAxisScale = React.useMemo(() => {
    const ocvVisible = legendSelected['OCV'] !== false;
    const visibleYValues = chartSeries
      .filter(s => legendSelected[s.name] !== false)
      .flatMap(s => {
        const data = s.data || [];
        // When OCV is hidden, skip the first point of each CCV series — it's the
        // connector point from OCV and would artificially expand the Y range.
        const effectiveData = (!ocvVisible && s.name === 'CCV' && data.length > 1)
          ? data.slice(1)
          : data;
        return effectiveData
          .map(d => (Array.isArray(d) ? d[1] : (typeof d === 'number' ? d : null)))
          .filter(v => v != null && !isNaN(v) && isFinite(v));
      });
    if (visibleYValues.length > 0) {
      const yMin = Math.min(...visibleYValues);
      const yMax = Math.max(...visibleYValues);
      const range = yMax - yMin;
      const pad = range * Y_AXIS_PADDING_RATIO || MIN_Y_AXIS_PADDING;
      return { min: +(yMin - pad).toFixed(4), max: +(yMax + pad).toFixed(4) };
    }
    return { scale: true };
  }, [chartSeries, legendSelected]);

  const chartOption = {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 36, right: 24, bottom: 40, left: 56 },
    legend: {
      top: 4,
      data: ['OCV', 'CCV'],
      selected: legendSelected,
      textStyle: { color: '#aaa', fontSize: 12 },
    },
    tooltip: { trigger: 'axis', formatter: (params) => params.map(p => `${p.marker}${p.seriesName}: ${p.value[1]?.toFixed(3)} V @ ${p.value[0]}s`).join('<br/>') },
    xAxis: {
      type: 'value',
      name: 's',
      nameLocation: 'end',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#444' } },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    yAxis: {
      type: 'value',
      name: 'V',
      nameLocation: 'end',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#444' } },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
      ...yAxisScale,
    },
    dataZoom: autoScroll
      ? [{ type: 'inside', filterMode: 'none' }]
      : [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 4 }],
    series: chartSeries,
  };

  // Results table columns
  const columns = [
    {
      title: t('batteryId'),
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (id) => <span>{id}</span>,
    },
    {
      title: t('batteryOcv'), dataIndex: 'ocv', key: 'ocv', width: 90,
      render: (v) => {
        const bad = ocvSpec && v != null && Math.abs(v - ocvSpec.center) > ocvSpec.tolerance;
        return <span style={{ color: bad ? '#ff4d4f' : undefined, fontWeight: bad ? 700 : undefined }}>{v != null ? v.toFixed(3) : '-'}</span>;
      },
    },
    {
      title: t('batteryCcv'), dataIndex: 'ccv', key: 'ccv', width: 90,
      render: (v) => {
        const bad = ccvSpec && v != null && Math.abs(v - ccvSpec.center) > ccvSpec.tolerance;
        return <span style={{ color: bad ? '#ff4d4f' : undefined, fontWeight: bad ? 700 : undefined }}>{v != null ? v.toFixed(3) : '-'}</span>;
      },
    },
    { title: t('batteryTime'), dataIndex: 'time', key: 'time', width: 80, render: (v) => v != null ? String(v) : '-' },
    { title: t('batteryCaliperDia'), dataIndex: 'dia', key: 'dia', width: 80, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
    { title: t('batteryCaliperHei'), dataIndex: 'hei', key: 'hei', width: 80, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
    {
      title: t('actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => {
        const recordIdx = records.findIndex(r => r.id === record.id);
        return (
          <Space size={4}>
            <Button size="small" onClick={() => handleRetest(record)} disabled={!connected || running}>
              {t('batteryRetest')}
            </Button>
            <Button
              size="small"
              icon={<span>📏</span>}
              onClick={() => {
                const recordIdx = records.findIndex(r => r.id === record.id);
                setCaliperIndex(recordIdx >= 0 ? recordIdx : 0);
                setCaliperSingleMode(true);
                setCaliperPhase(true);
                setCaliperMode('dia');
                setCaliperDia('');
                setCaliperHei('');
              }}
              disabled={running}
              title={t('batteryCaliperSection')}
            />
          </Space>
        );
      },
    },
  ];

  const ocvSpec = React.useMemo(() => {
    const v = parseFloat(ocvCenter);
    return isNaN(v) ? null : { center: v, tolerance: OCV_TOLERANCE };
  }, [ocvCenter]);
  const ccvSpec = React.useMemo(() => {
    const v = parseFloat(ccvCenter);
    return isNaN(v) ? null : { center: v, tolerance: CCV_TOLERANCE };
  }, [ccvCenter]);

  const recordsMap = React.useMemo(() => {
    const map = {};
    records.forEach((r) => { map[String(r.id)] = r; });
    return map;
  }, [records]);

  const filteredHistory = React.useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return historyRecords.filter((r) => {
      if (historyTypeFilter && r._batteryType !== historyTypeFilter) return false;
      if (historyLineFilter && r._productLine !== historyLineFilter) return false;
      if (search && !(r._orderId || '').toLowerCase().includes(search)) return false;
      return true;
    });
  }, [historyRecords, historySearch, historyTypeFilter, historyLineFilter]);

  const handleExportHistoryExcel = useCallback(() => {
    const headers = ['Date', 'Order ID', 'Battery Type', 'Product Line', 'ID', 'OCV (V)', 'CCV (V)', 'Time (s)', 'Dia (mm)', 'Hei (mm)', 'Status'];
    const rows = filteredHistory.map((r) => [
      r._isoDate || r._session || '',
      r._orderId || '',
      r._batteryType || '',
      r._productLine || '',
      r.id ?? '',
      r.ocv != null ? r.ocv.toFixed(3) : '',
      r.ccv != null ? r.ccv.toFixed(3) : '',
      r.time != null ? String(r.time) : '',
      r.dia != null ? r.dia.toFixed(2) : '',
      r.hei != null ? r.hei.toFixed(2) : '',
      r.status || '',
    ]);

    const escape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const xmlRows = [headers, ...rows].map((row) =>
      `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escape(cell)}</Data></Cell>`).join('')}</Row>`
    ).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Battery History">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `battery_history_${dayjs().format('YYYY-MM-DD')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredHistory]);

  const buildMiniChartOption = React.useCallback((batteryId) => {
    const readings = readingsByBattery[batteryId] || [];
    const ocvData = readings.filter(r => r.phase === 'ocv').map(r => [r.t, r.v]);
    const ccvData = readings.filter(r => r.phase === 'ccv').map(r => [r.t, r.v]);
    const ccvDataConnected = ocvData.length > 0 && ccvData.length > 0
      ? [ocvData[ocvData.length - 1], ...ccvData]
      : ccvData;
    return {
      backgroundColor: 'transparent',
      grid: { top: 20, right: 16, bottom: 24, left: 48 },
      tooltip: { trigger: 'axis', formatter: (params) => params.map(p => `${p.marker}${p.seriesName}: ${p.value[1]?.toFixed(3)}V @ ${p.value[0]}s`).join('<br/>') },
      xAxis: {
        type: 'value',
        name: 's',
        axisLabel: { color: '#aaa', fontSize: 10 },
        splitLine: { lineStyle: { color: '#2a2a2a' } },
      },
      yAxis: {
        type: 'value',
        name: 'V',
        scale: true,
        axisLabel: { color: '#aaa', fontSize: 10 },
        splitLine: { lineStyle: { color: '#2a2a2a' } },
      },
      series: [
        { name: 'OCV', type: 'line', data: ocvData, symbol: 'none', lineStyle: { color: '#ffee58', width: 1.5 } },
        { name: 'CCV', type: 'line', data: ccvDataConnected, symbol: 'none', lineStyle: { color: '#0091ea', width: 1.5 } },
      ],
    };
  }, [readingsByBattery]);

  const prevRecordsLenRef = useRef(records.length);
  useEffect(() => {
    if (records.length <= prevRecordsLenRef.current) return;
    prevRecordsLenRef.current = records.length;
    const latest = records[records.length - 1];
    if (!latest) return;
    const ocvBad = ocvSpec && latest.ocv != null && Math.abs(latest.ocv - ocvSpec.center) > ocvSpec.tolerance;
    const ccvBad = ccvSpec && latest.ccv != null && Math.abs(latest.ccv - ccvSpec.center) > ccvSpec.tolerance;
    if (ocvBad || ccvBad) {
      const parts = [];
      if (ocvBad) parts.push(`OCV ${latest.ocv.toFixed(3)}V (spec: ${ocvSpec.center}±${OCV_TOLERANCE})`);
      if (ccvBad) parts.push(`CCV ${latest.ccv.toFixed(3)}V (spec: ${ccvSpec.center}±${CCV_TOLERANCE})`);
      notification.error({
        message: `⚠️ Pin #${latest.id} ${t('batteryOutOfSpec')}`,
        description: `${parts.join(', ')} — ${t('batteryRetestRequired')}`,
        duration: 0,
      });
    }
  }, [records, ocvSpec, ccvSpec, t]);

  useEffect(() => {
    try {
      const sessionData = {
        records,
        chartData,
        chartDataOCV,
        chartDataCCV,
        orderId,
        testDate: testDate ? testDate.format('YYYY-MM') : null,
        batteryType,
        productLine,
        ocvCenter,
        ccvCenter,
        chartSeriesByBattery,
        readingsByBattery,
      };
      localStorage.setItem('battery_session', JSON.stringify(sessionData));
    } catch {}
  }, [records, chartData, chartDataOCV, chartDataCCV, orderId, testDate, batteryType, productLine, ocvCenter, ccvCenter, chartSeriesByBattery, readingsByBattery]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('battery_session') || '{}');
      if (parsed?.records?.length > 0) {
        setSavedSessionInfo(parsed);
        setResumeModalVisible(true);
      }
    } catch {}
  }, []);

  // Verify template file still exists on server on mount
  useEffect(() => {
    getTemplateInfo().then(res => {
      if (res.data.exists) {
        const saved = localStorage.getItem('battery_template_name');
        if (saved) setTemplateName(saved);
      } else {
        localStorage.removeItem('battery_template_name');
        setTemplateName(null);
      }
    }).catch(() => {});
  }, []);

  // Verify archive file still exists on server on mount
  useEffect(() => {
    getArchiveInfo().then(res => {
      if (res.data.exists) {
        const saved = localStorage.getItem('battery_archive_name');
        if (saved) setArchiveName(saved);
      } else {
        localStorage.removeItem('battery_archive_name');
        setArchiveName(null);
      }
    }).catch(() => {});
  }, []);

  const inputsDisabled = !connected;
  const canStart = connected && !running && orderId.trim() !== '' && testDate !== null && ocvCenter != null && ccvCenter != null;

  return (
    <div>
      <style>{`.battery-row-bad td { background: rgba(255,77,79,0.12) !important; }`}</style>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          🔋 {t('batteryTest')}
        </Title>
      </div>

      {/* Connection + Parameters row */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* Connection Card */}
        <Col xs={24} md={12} lg={10}>
          <Card
            title={
              <Space>
                <ApiOutlined />
                {t('batteryConnection')}
                <Badge
                  status={connected ? 'success' : 'default'}
                  text={connected ? t('batteryConnected') : t('batteryNotConnected')}
                />
              </Space>
            }
            size="small"
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={8} align="middle">
                <Col flex="auto">
                  <Select
                    placeholder={t('batterySelectPort')}
                    value={port || undefined}
                    onChange={setPort}
                    style={{ width: '100%' }}
                    disabled={connected}
                  >
                    {ports.map((p) => (
                      <Option key={p} value={p}>{p}</Option>
                    ))}
                  </Select>
                </Col>
                <Col>
                  <Tooltip title={t('batteryRefreshPorts')}>
                    <Button icon={<ReloadOutlined />} onClick={handleRefreshPorts} disabled={connected} />
                  </Tooltip>
                </Col>
              </Row>

              <Row gutter={8}>
                <Col flex="auto">
                  <Select
                    value={baudRate}
                    onChange={setBaudRate}
                    style={{ width: '100%' }}
                    disabled={connected}
                  >
                    {[9600, 19200, 38400, 57600, 115200].map((b) => (
                      <Option key={b} value={b}>{b}</Option>
                    ))}
                  </Select>
                </Col>
                <Col>
                  <Checkbox
                    checked={simMode}
                    onChange={(e) => setSimMode(e.target.checked)}
                    disabled={connected}
                  >
                    {t('batterySimMode')}
                  </Checkbox>
                </Col>
              </Row>

              {!connected ? (
                <Button
                  type="primary"
                  icon={<ApiOutlined />}
                  onClick={handleConnect}
                  loading={connecting}
                  block
                >
                  {connecting ? t('batteryConnecting') : t('batteryConnect')}
                </Button>
              ) : (
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={handleDisconnect}
                  block
                >
                  {t('batteryDisconnect')}
                </Button>
              )}
            </Space>
          </Card>
        </Col>

        {/* Parameters Card */}
        <Col xs={24} md={12} lg={14}>
          <Card title={t('batteryParameters')} size="small">
            <Row gutter={[8, 8]}>
              <Col xs={24} sm={12}>
                <Form.Item label={t('batteryOrderId')} style={{ marginBottom: 0 }}>
                  <Input
                    value={orderId}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      if (records.length > 0 && newVal !== orderId) {
                        setPendingOrderId(newVal);
                        setOrderIdChangeModalVisible(true);
                      } else {
                        setOrderId(newVal);
                      }
                    }}
                    disabled={inputsDisabled}
                    placeholder="e.g. ORD-001"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('batteryTestMonth')} style={{ marginBottom: 0 }}>
                  <DatePicker
                    picker="month"
                    value={testDate}
                    onChange={setTestDate}
                    disabled={inputsDisabled}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryResistance')} style={{ marginBottom: 0 }}>
                  <InputNumber
                    value={resistance}
                    onChange={setResistance}
                    disabled={inputsDisabled}
                    min={0.01}
                    step={0.01}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryOcvTime')} style={{ marginBottom: 0 }}>
                  <InputNumber
                    value={ocvTime}
                    onChange={setOcvTime}
                    disabled={inputsDisabled}
                    min={0.1}
                    step={0.1}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryLoadTime')} style={{ marginBottom: 0 }}>
                  <InputNumber
                    value={loadTime}
                    onChange={setLoadTime}
                    disabled={inputsDisabled}
                    min={0.1}
                    step={0.1}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryKCoeff')} style={{ marginBottom: 0 }}>
                  <InputNumber
                    value={kCoeff}
                    onChange={setKCoeff}
                    disabled={inputsDisabled}
                    min={0}
                    step={0.01}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryType')} style={{ marginBottom: 0 }}>
                  <Select
                    value={batteryType}
                    onChange={setBatteryType}
                    disabled={inputsDisabled}
                    style={{ width: '100%' }}
                  >
                    <Option value="LR6">LR6</Option>
                    <Option value="LR03">LR03</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label={t('batteryProductLine')} style={{ marginBottom: 0 }}>
                  <Select
                    value={productLine}
                    onChange={setProductLine}
                    disabled={inputsDisabled}
                    style={{ width: '100%' }}
                  >
                    <Option value="UD+">UD+</Option>
                    <Option value="UD">UD</Option>
                    <Option value="HP">HP</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={12} sm={12}>
                <Form.Item label={t('batteryOcvStandard')} style={{ marginBottom: 0 }} required>
                  <InputNumber
                    value={ocvCenter}
                    onChange={setOcvCenter}
                    disabled={inputsDisabled}
                    min={0}
                    step={0.001}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={12}>
                <Form.Item label={t('batteryCcvStandard')} style={{ marginBottom: 0 }} required>
                  <InputNumber
                    value={ccvCenter}
                    onChange={setCcvCenter}
                    disabled={inputsDisabled}
                    min={0}
                    step={0.001}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Status Bar */}
      <div
        style={{
          background: '#000',
          borderRadius: 8,
          padding: '12px 20px',
          marginBottom: 16,
          color: statusColor,
          fontSize: 18,
          fontWeight: 600,
          fontFamily: 'monospace',
          letterSpacing: 1,
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span>{t('batteryStatus')}:</span>
        <span>{statusText}</span>
      </div>

      {/* Caliper Card — only shown after OCV/CCV phase is done */}
      {caliperPhase && (
      <Card
        size="small"
        title={
          <span>
            📏 {t('batteryCaliperSection')}
            {records.length > 0 && records[caliperIndex] != null && (
              <span style={{ fontSize: 12, color: caliperSingleMode ? '#faad14' : '#69b1ff', marginLeft: 8 }}>
                {caliperSingleMode
                  ? `(Re-measure: ${t('batteryId')} ${records[caliperIndex].id})`
                  : `(${t('batteryId')}: ${records[caliperIndex].id} / ${records.length})`
                }
              </span>
            )}
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Space direction="horizontal" wrap>
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t('batteryCaliperMode')}</span>
            <Radio.Group
              value={caliperMode}
              onChange={(e) => setCaliperMode(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="dia">{t('batteryCaliperModeDia')}</Radio.Button>
              <Radio.Button value="hei">{t('batteryCaliperModeHei')}</Radio.Button>
            </Radio.Group>
          </Space>
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t('batteryCaliperBuffer')}</span>
            <Input
              ref={caliperInputRef}
              size="small"
              value={caliperBuffer}
              placeholder={t('batteryCaliperBuffer')}
              style={{ width: 160, fontFamily: 'monospace', background: caliperBuffer ? '#1a3a1a' : undefined }}
              readOnly
            />
          </Space>
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t('batteryCaliperDia')} (mm)</span>
            <InputNumber
              size="small"
              value={caliperDia ? parseFloat(caliperDia) : null}
              onChange={(v) => setCaliperDia(v != null ? String(v) : '')}
              step={0.01}
              style={{ width: 100 }}
              placeholder="—"
            />
          </Space>
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{t('batteryCaliperHei')} (mm)</span>
            <InputNumber
              size="small"
              value={caliperHei ? parseFloat(caliperHei) : null}
              onChange={(v) => setCaliperHei(v != null ? String(v) : '')}
              step={0.01}
              style={{ width: 100 }}
              placeholder="—"
            />
          </Space>
          <Tooltip title={t('batteryCaliperHint')}>
            <QuestionCircleOutlined style={{ color: '#888', marginTop: 20 }} />
          </Tooltip>
        </Space>
        <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
          💡 {t('batteryCaliperHint')}
        </div>
        <div style={{ marginTop: 8 }}>
          <Button
            onClick={handleSaveCaliper}
          >
            {t('batteryCaliperSkip')}
          </Button>
          <Button
            style={{ marginLeft: 8 }}
            onClick={handleResetCaliper}
          >
            {t('cancel')}
          </Button>
        </div>
      </Card>
      )}

      {/* Excel Report Card */}
      <Collapse
        style={{ marginBottom: 16 }}
        items={[{
          key: 'excel-report',
          label: t('batteryExcelReport'),
          children: (
            <Row gutter={[16, 8]}>
              <Col xs={24} md={12}>
                <Upload.Dragger
                  accept=".xlsx"
                  showUploadList={false}
                  customRequest={handleTemplateUpload}
                  style={{ padding: '8px 16px' }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">{t('batteryTemplateUpload')}</p>
                  <p className="ant-upload-hint">{t('batteryTemplateUploadHint')}</p>
                  {templateName && (
                    <p style={{ color: '#52c41a', marginTop: 4 }}>
                      {t('batteryCurrentTemplate')}: <strong>{templateName}</strong>
                    </p>
                  )}
                  {!templateName && (
                    <p style={{ color: '#888', marginTop: 4 }}>{t('batteryNoTemplate')}</p>
                  )}
                </Upload.Dragger>
              </Col>
              <Col xs={24} md={12}>
                <Upload.Dragger
                  accept=".xlsx"
                  showUploadList={false}
                  customRequest={handleArchiveUpload}
                  style={{ padding: '8px 16px' }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">{t('batteryArchiveUpload')}</p>
                  <p className="ant-upload-hint">{t('batteryArchiveUploadHint')}</p>
                  {archiveName && (
                    <p style={{ color: '#52c41a', marginTop: 4 }}>
                      {t('batteryCurrentArchive')}: <strong>{archiveName}</strong>
                    </p>
                  )}
                  {!archiveName && (
                    <p style={{ color: '#888', marginTop: 4 }}>{t('batteryNoArchive')}</p>
                  )}
                </Upload.Dragger>
              </Col>
              <Col xs={24} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadTemplateReport}
                  disabled={records.length === 0}
                  loading={downloadingTemplate}
                  style={{ flex: 1 }}
                >
                  {t('batteryDownloadTemplateReport')}
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadArchiveReport}
                  disabled={records.length === 0}
                  loading={downloadingArchive}
                  style={{ flex: 1 }}
                >
                  {t('batteryDownloadArchiveReport')}
                </Button>
              </Col>
            </Row>
          ),
        }]}
      />

      {/* Chart + Results */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* Chart */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                {t('batteryChart')}
                <Checkbox
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                >
                  {t('batteryAutoScroll')}
                </Checkbox>
              </Space>
            }
            extra={<Button icon={<FullscreenOutlined />} size="small" onClick={() => setChartZoomVisible(true)} />}
            size="small"
            bodyStyle={{ padding: 8, background: '#111', borderRadius: '0 0 8px 8px' }}
          >
            <ReactECharts
              option={chartOption}
              style={{ height: 280 }}
              notMerge={true}
              lazyUpdate={true}
              theme="dark"
              onEvents={{
                legendselectchanged: (params) => setLegendSelected(params.selected),
              }}
            />
          </Card>
        </Col>

        {/* Results Table */}
        <Col xs={24} lg={10}>
          <Card size="small" style={{ height: '100%' }} extra={<Button icon={<FullscreenOutlined />} size="small" onClick={() => setTableZoomVisible(true)} />}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              size="small"
              items={[
                {
                  key: 'results',
                  label: t('batteryResults'),
                  children: (
                    <Table
                      dataSource={records}
                      columns={columns}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      locale={{ emptyText: t('batteryNoResults') }}
                      scroll={{ x: true, y: 240 }}
                      rowClassName={(record) => {
                        const ocvBad = ocvSpec && record.ocv != null && Math.abs(record.ocv - ocvSpec.center) > ocvSpec.tolerance;
                        const ccvBad = ccvSpec && record.ccv != null && Math.abs(record.ccv - ccvSpec.center) > ccvSpec.tolerance;
                        return (ocvBad || ccvBad) ? 'battery-row-bad' : '';
                      }}
                      components={{
                        body: {
                          row: (rowProps) => {
                            const record = recordsMap[String(rowProps['data-row-key'])];
                            return <RowWithPopover record={record} readingsByBattery={readingsByBattery} buildMiniChartOption={buildMiniChartOption} {...rowProps} />;
                          },
                        },
                      }}
                    />
                  ),
                },
                {
                  key: 'history',
                  label: t('batteryHistory'),
                  children: (
                    <>
                      <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
                        <Col flex="auto">
                          <Input
                            size="small"
                            allowClear
                            placeholder={t('batteryHistorySearch')}
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                          />
                        </Col>
                        <Col>
                          <Select
                            size="small"
                            style={{ width: 90 }}
                            value={historyTypeFilter || undefined}
                            placeholder={t('batteryHistoryAllTypes')}
                            allowClear
                            onChange={(v) => setHistoryTypeFilter(v || '')}
                          >
                            <Option value="LR6">LR6</Option>
                            <Option value="LR03">LR03</Option>
                          </Select>
                        </Col>
                        <Col>
                          <Select
                            size="small"
                            style={{ width: 80 }}
                            value={historyLineFilter || undefined}
                            placeholder={t('batteryHistoryAllLines')}
                            allowClear
                            onChange={(v) => setHistoryLineFilter(v || '')}
                          >
                            <Option value="UD+">UD+</Option>
                            <Option value="UD">UD</Option>
                            <Option value="HP">HP</Option>
                          </Select>
                        </Col>
                        <Col>
                          <Button
                            size="small"
                            icon={<ExportOutlined />}
                            onClick={handleExportHistoryExcel}
                            disabled={filteredHistory.length === 0}
                          >
                            {t('batteryHistoryExportExcel')}
                          </Button>
                        </Col>
                        <Col>
                          <Button
                            size="small"
                            icon={<DeleteOutlined />}
                            danger
                            onClick={() => {
                              Modal.confirm({
                                title: t('batteryClearHistoryConfirmTitle'),
                                content: t('batteryClearHistoryConfirmContent'),
                                okText: t('confirm'),
                                cancelText: t('cancel'),
                                okButtonProps: { danger: true },
                                onOk: () => {
                                  setHistoryRecords([]);
                                  localStorage.removeItem('battery_history');
                                },
                              });
                            }}
                          >
                            {t('batteryClearHistory')}
                          </Button>
                        </Col>
                      </Row>
                      <Table
                        dataSource={filteredHistory}
                        columns={[
                          { title: t('batteryDate'), dataIndex: '_session', key: '_session', width: 100 },
                          { title: t('batteryOrderId'), dataIndex: '_orderId', key: '_orderId', width: 100, render: (v) => v || '-' },
                          { title: t('batteryType'), dataIndex: '_batteryType', key: '_batteryType', width: 70, render: (v) => v || '-' },
                          { title: t('batteryProductLine'), dataIndex: '_productLine', key: '_productLine', width: 80, render: (v) => v || '-' },
                          { title: t('batteryId'), dataIndex: 'id', key: 'id', width: 50 },
                          { title: t('batteryOcv'), dataIndex: 'ocv', key: 'ocv', width: 80, render: (v) => v != null ? v.toFixed(3) : '-' },
                          { title: t('batteryCcv'), dataIndex: 'ccv', key: 'ccv', width: 80, render: (v) => v != null ? v.toFixed(3) : '-' },
                          { title: t('batteryTime'), dataIndex: 'time', key: 'time', width: 80, render: (v) => v != null ? String(v) : '-' },
                          { title: t('batteryCaliperDia'), dataIndex: 'dia', key: 'dia', width: 70, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
                          { title: t('batteryCaliperHei'), dataIndex: 'hei', key: 'hei', width: 70, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
                          {
                            title: t('status'),
                            dataIndex: 'status',
                            key: 'status',
                            width: 80,
                            render: (v) => v ? <Tag color="blue">{v}</Tag> : '-',
                          },
                        ]}
                        rowKey={(r, i) => `${r._session}_${r.id}_${i}`}
                        size="small"
                        pagination={false}
                        locale={{ emptyText: t('batteryNoResults') }}
                        scroll={{ x: true, y: 200 }}
                      />
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Action Buttons */}
      <Space wrap>
        <Tooltip title={!canStart && !running ? t('batteryFillRequiredFields') : undefined}>
          <Button
            type="primary"
            size="large"
            icon={running ? <StopOutlined /> : <PlayCircleOutlined />}
            danger={running}
            disabled={running ? false : !canStart}
            onClick={handleStartStop}
          >
            {running ? t('batteryStop') : t('batteryStart')}
          </Button>
        </Tooltip>

        <Divider type="vertical" />

        <Button
          icon={<DeleteOutlined />}
          onClick={() => {
            Modal.confirm({
              title: t('batteryClearSessionConfirmTitle'),
              content: t('batteryClearSessionConfirmContent'),
              okText: t('confirm'),
              cancelText: t('cancel'),
              okButtonProps: { danger: true },
              onOk: handleClearSession,
            });
          }}
          disabled={!connected || records.length === 0}
        >
          {t('batteryClearSession')}
        </Button>

        {!running && records.length > 0 && !caliperPhase && (
          <>
            <Divider type="vertical" />
            <Button
              type="primary"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => {
                setCaliperPhase(true);
                setCaliperSingleMode(false);
                setCaliperMode('dia');
                setCaliperDia('');
                setCaliperHei('');
                setCaliperIndex(0);
              }}
            >
              ✅ {t('batteryOcvCcvDone')}
            </Button>
          </>
        )}
      </Space>
      <Modal
        open={resumeModalVisible}
        title={t('batteryResumeTitle')}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={[
          <Button key="new" danger onClick={() => {
            localStorage.removeItem('battery_session');
            setRecords([]);
            setChartData([]);
            setChartDataOCV([]);
            setChartDataCCV([]);
            setChartSeriesByBattery({});
            setReadingsByBattery({});
            setOrderId('');
            setTestDate(dayjs());
            setBatteryType('LR6');
            setProductLine('UD+');
            setOcvCenter(null);
            setCcvCenter(null);
            setResumeModalVisible(false);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: 'clear_session' }));
            } else {
              pendingNewSessionRef.current = true;
            }
          }}>{t('batteryNewSession')}</Button>,
          <Button key="continue" type="primary" onClick={() => {
            setResumeModalVisible(false);
          }}>{t('batteryContinueSession')}</Button>,
        ]}
      >
        <p>{t('batteryResumeDesc')}</p>
        {savedSessionInfo && (
          <ul>
            <li><strong>{t('batteryOrderId')}:</strong> {savedSessionInfo.orderId || '-'}</li>
            <li><strong>{t('batteryType')}:</strong> {savedSessionInfo.batteryType || '-'}</li>
            <li><strong>{t('batteryProductLine')}:</strong> {savedSessionInfo.productLine || '-'}</li>
            <li><strong>{t('batteryDate')}:</strong> {savedSessionInfo.testDate || '-'}</li>
            <li><strong>{t('batteryResults')}:</strong> {savedSessionInfo.records?.length || 0} {t('batteryId')}</li>
          </ul>
        )}
      </Modal>
      {/* Order ID Change Warning Modal */}
      <Modal
        open={orderIdChangeModalVisible}
        title={<Space><span style={{ color: '#faad14' }}>⚠️</span><span>{t('batteryOrderIdChangeTitle')}</span></Space>}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={[
          <Button key="cancel" onClick={() => { setPendingOrderId(''); setOrderIdChangeModalVisible(false); }}>{t('cancel')}</Button>,
          <Button key="confirm" type="primary" danger onClick={() => { setOrderId(pendingOrderId); setPendingOrderId(''); setOrderIdChangeModalVisible(false); }}>{t('confirm')}</Button>,
        ]}
      >
        <p>{t('batteryOrderIdChangeDesc')}</p>
        <ul>
          <li><strong>{t('batteryOrderIdChangeCurrent')}:</strong> {orderId || '-'}</li>
          <li><strong>{t('batteryOrderIdChangeNew')}:</strong> {pendingOrderId || '-'}</li>
          <li><strong>{t('batteryResults')}:</strong> {records.length} {t('batteryId')}</li>
        </ul>
        <p style={{ color: '#ff4d4f', marginTop: 8 }}>{t('batteryOrderIdChangeWarning')}</p>
      </Modal>
      {/* Chart Zoom Modal */}
      <Modal
        open={chartZoomVisible}
        onCancel={() => setChartZoomVisible(false)}
        footer={null}
        width="90vw"
        title={t('batteryChart')}
        destroyOnClose
        bodyStyle={{ background: '#111', padding: 8 }}
      >
        <ReactECharts
          option={{ ...chartOption, dataZoom: ZOOM_CHART_DATA_ZOOM }}
          style={{ height: 'calc(80vh - 60px)' }}
          notMerge={true}
          theme="dark"
          onEvents={{
            legendselectchanged: (params) => setLegendSelected(params.selected),
          }}
        />
      </Modal>
      {/* Table Zoom Modal */}
      <Modal
        open={tableZoomVisible}
        onCancel={() => setTableZoomVisible(false)}
        footer={null}
        width="90vw"
        title={activeTab === 'history' ? t('batteryHistory') : t('batteryResults')}
        destroyOnClose
      >
        {activeTab === 'results' ? (
          <Table
            dataSource={records}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
            }}
            locale={{ emptyText: t('batteryNoResults') }}
            scroll={{ x: true, y: ZOOM_MODAL_TABLE_SCROLL_Y }}
            rowClassName={(record) => {
              const ocvBad = ocvSpec && record.ocv != null && Math.abs(record.ocv - ocvSpec.center) > ocvSpec.tolerance;
              const ccvBad = ccvSpec && record.ccv != null && Math.abs(record.ccv - ccvSpec.center) > ccvSpec.tolerance;
              return (ocvBad || ccvBad) ? 'battery-row-bad' : '';
            }}
          />
        ) : (
          <Table
            dataSource={filteredHistory}
            columns={[
              { title: t('batteryDate'), dataIndex: '_session', key: '_session', width: 100 },
              { title: t('batteryOrderId'), dataIndex: '_orderId', key: '_orderId', width: 100, render: (v) => v || '-' },
              { title: t('batteryType'), dataIndex: '_batteryType', key: '_batteryType', width: 70, render: (v) => v || '-' },
              { title: t('batteryProductLine'), dataIndex: '_productLine', key: '_productLine', width: 80, render: (v) => v || '-' },
              { title: t('batteryId'), dataIndex: 'id', key: 'id', width: 50 },
              { title: t('batteryOcv'), dataIndex: 'ocv', key: 'ocv', width: 80, render: (v) => v != null ? v.toFixed(3) : '-' },
              { title: t('batteryCcv'), dataIndex: 'ccv', key: 'ccv', width: 80, render: (v) => v != null ? v.toFixed(3) : '-' },
              { title: t('batteryTime'), dataIndex: 'time', key: 'time', width: 80, render: (v) => v != null ? String(v) : '-' },
              { title: t('batteryCaliperDia'), dataIndex: 'dia', key: 'dia', width: 70, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
              { title: t('batteryCaliperHei'), dataIndex: 'hei', key: 'hei', width: 70, render: (v) => v != null ? parseFloat(v).toFixed(2) : '-' },
              { title: t('status'), dataIndex: 'status', key: 'status', width: 80, render: (v) => v ? <Tag color="blue">{v}</Tag> : '-' },
            ]}
            rowKey={(r, i) => `${r._session}_${r.id}_${i}`}
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
            }}
            locale={{ emptyText: t('batteryNoResults') }}
            scroll={{ x: true, y: ZOOM_MODAL_TABLE_SCROLL_Y }}
          />
        )}
      </Modal>
    </div>
  );
}
