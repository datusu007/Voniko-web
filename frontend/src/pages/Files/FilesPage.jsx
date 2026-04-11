import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Button, Space, Input, Typography, Tag, Tooltip,
  Modal, Form, Upload, Select, message, Popconfirm, Card,
} from 'antd';
import {
  UploadOutlined, PlusOutlined, SearchOutlined,
  DeleteOutlined, EyeOutlined, InboxOutlined, FolderOutlined, LockOutlined, TagOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { getFolders } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import { removePendingUpload } from '../../utils/pendingUploads';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export default function FilesPage() {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterWorkshopId, setFilterWorkshopId] = useState(null);
  const [filterLineId, setFilterLineId] = useState(null);
  const [filterMachineId, setFilterMachineId] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFileId, setUploadFileId] = useState(null);
  const [uploadFileName, setUploadFileName] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [folders, setFolders] = useState({ workshops: [], lines: [] });
  const foldersRef = useRef({ workshops: [], lines: [] });
  const [uploadLineId, setUploadLineId] = useState(null);
  const [uploadMachineId, setUploadMachineId] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [filterTagId, setFilterTagId] = useState(null);

  const { t } = useLang();
  const { canEdit, isAdmin } = useAuth();
  const navigate = useNavigate();

  const fetchFolders = useCallback(async () => {
    try {
      const res = await getFolders();
      foldersRef.current = res.data;
      setFolders(res.data);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get('/tags');
      setAllTags(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (filterMachineId) params.folderId = filterMachineId;
      const res = await api.get('/files', { params });
      let data = res.data.data;
      // client-side filter by line when no specific machine is selected
      if (filterLineId && !filterMachineId) {
        const allLines = [
          ...(foldersRef.current.workshops || []).flatMap(w => w.lines || []),
          ...(foldersRef.current.lines || []),
        ];
        const line = allLines.find(l => l.id === filterLineId);
        if (line) {
          const machineIds = new Set((line.machines || []).map(m => m.id));
          data = data.filter(f => f.folderId && machineIds.has(f.folderId));
        }
      } else if (filterWorkshopId && !filterLineId && !filterMachineId) {
        const workshop = (foldersRef.current.workshops || []).find(w => w.id === filterWorkshopId);
        if (workshop) {
          const machineIds = new Set(
            (workshop.lines || []).flatMap(l => (l.machines || []).map(m => m.id))
          );
          data = data.filter(f => f.folderId && machineIds.has(f.folderId));
        }
      }
      // client-side filter by tag
      if (filterTagId) {
        data = data.filter(f => (f.tags || []).some(tag => tag.id === filterTagId));
      }
      setFiles(data);
      setTotal((filterLineId && !filterMachineId) || (filterWorkshopId && !filterLineId && !filterMachineId) ? data.length : res.data.total);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterWorkshopId, filterLineId, filterMachineId, filterTagId]);

  useEffect(() => { fetchFolders(); fetchTags(); }, []);
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleSearch = (value) => { setSearch(value); setPage(1); };
  const handleFilterWorkshop = (value) => { setFilterWorkshopId(value || null); setFilterLineId(null); setFilterMachineId(null); setPage(1); };
  const handleFilterLine = (value) => { setFilterLineId(value || null); setFilterMachineId(null); setPage(1); };
  const handleFilterMachine = (value) => { setFilterMachineId(value || null); setPage(1); };
  const handleFilterTag = (value) => { setFilterTagId(value || null); setPage(1); };

  const handleUpload = async (values) => {
    if (!fileList.length) { message.error(t('selectFile')); return; }
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileList[0].originFileObj);
      if (values.commitMessage) formData.append('commitMessage', values.commitMessage);
      if (values.description) formData.append('description', values.description);
      // When uploading a new version for a specific file, send fileId for stable identification
      if (uploadFileId) {
        formData.append('fileId', uploadFileId);
      } else if (uploadMachineId) {
        formData.append('folderId', uploadMachineId);
      }
      await api.post('/files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (uploadFileId) removePendingUpload(uploadFileId);
      message.success(t('fileUploaded'));
      setUploadModal(false);
      form.resetFields();
      setFileList([]);
      setUploadLineId(null);
      setUploadMachineId(null);
      setUploadFileId(null);
      setUploadFileName(null);
      fetchFiles();
    } catch (err) {
      message.error(err.response?.data?.message || t('error'));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/files/${id}`);
      message.success(t('fileDeleted'));
      fetchFiles();
    } catch (err) {
      message.error(err.response?.data?.message || t('error'));
    }
  };

  const allFilterLines = filterWorkshopId
    ? ((folders.workshops || []).find(w => w.id === filterWorkshopId)?.lines || [])
    : [
        ...(folders.workshops || []).flatMap(w => w.lines || []),
        ...(folders.lines || []),
      ];
  const filterLine = allFilterLines.find(l => l.id === filterLineId);
  const filterMachines = filterLine ? (filterLine.machines || []) : [];
  const uploadLine = [
    ...(folders.workshops || []).flatMap(w => w.lines || []),
    ...(folders.lines || []),
  ].find(l => l.id === uploadLineId);
  const uploadMachines = uploadLine ? (uploadLine.machines || []) : [];

  const closeModal = () => {
    setUploadModal(false);
    form.resetFields();
    setFileList([]);
    setUploadLineId(null);
    setUploadMachineId(null);
    setUploadFileId(null);
    setUploadFileName(null);
  };

  const columns = [
    {
      title: t('fileName'),
      dataIndex: 'name',
      render: (name, record) => (
        <div>
          <Space size={4}>
            <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/files/${record.id}`)}>
              {name}
            </Button>
            {record.lockedBy && (
              <Tooltip title={`${t('fileLockedBy')}: ${record.lockedByName || record.lockedBy}`}>
                <LockOutlined style={{ color: '#faad14', fontSize: 13 }} />
              </Tooltip>
            )}
          </Space>
          {(record.tags || []).length > 0 && (
            <div style={{ marginTop: 2 }}>
              {record.tags.map(tag => <Tag key={tag.id} color={tag.color} style={{ marginBottom: 2, fontSize: 11 }}>{tag.name}</Tag>)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('folderPath'),
      dataIndex: 'folderPath',
      render: (fp, record) => {
        if (fp) {
          return (
            <Space size={4}>
              <FolderOutlined style={{ color: '#1677ff' }} />
              <Text type="secondary">{fp}</Text>
            </Space>
          );
        }
        if (record.path && record.path !== '/') {
          return <Text type="secondary">{record.path}</Text>;
        }
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: t('versions'),
      dataIndex: 'versionCount',
      width: 90,
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: t('fileSize'),
      dataIndex: 'currentSize',
      width: 100,
      render: formatBytes,
    },
    {
      title: t('updatedAt'),
      dataIndex: 'lastModified',
      width: 160,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: t('createdBy'),
      dataIndex: 'createdBy',
      width: 120,
    },
    {
      title: t('actions'),
      width: 130,
      render: (_, record) => (
        <Space>
          <Tooltip title={t('viewDetails')}>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/files/${record.id}`)} />
          </Tooltip>
          {(canEdit || isAdmin) && (
            <Tooltip title={t('uploadNewVersion')}>
              <Button
                type="text"
                size="small"
                icon={<SyncOutlined />}
                onClick={() => {
                  setUploadFileId(record.id);
                  setUploadFileName(record.name);
                  setUploadModal(true);
                }}
              />
            </Tooltip>
          )}
          {(canEdit || isAdmin) && (
            <Popconfirm
              title={t('deleteFileConfirm')}
              onConfirm={() => handleDelete(record.id)}
              okText={t('yes')}
              cancelText={t('no')}
            >
              <Tooltip title={t('deleteFile')}>
                <Button type="text" size="small" icon={<DeleteOutlined />} danger />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>{t('fileList')}</Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModal(true)}>
            {t('uploadFile')}
          </Button>
        )}
      </div>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Input.Search
            placeholder={t('search')}
            allowClear
            onSearch={handleSearch}
            style={{ maxWidth: 300 }}
            prefix={<SearchOutlined />}
          />
          {(folders.workshops || []).length > 0 && (
            <Select
              allowClear
              placeholder={t('allWorkshops')}
              style={{ width: 180 }}
              onChange={handleFilterWorkshop}
              value={filterWorkshopId}
            >
              {(folders.workshops || []).map(w => <Option key={w.id} value={w.id}>{w.name}</Option>)}
            </Select>
          )}
          <Select
            allowClear
            placeholder={t('allLines')}
            style={{ width: 180 }}
            onChange={handleFilterLine}
            value={filterLineId}
          >
            {allFilterLines.map(l => <Option key={l.id} value={l.id}>{l.name}</Option>)}
          </Select>
          {filterLineId && (
            <Select
              allowClear
              placeholder={t('allMachines')}
              style={{ width: 180 }}
              onChange={handleFilterMachine}
              value={filterMachineId}
            >
              {filterMachines.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
            </Select>
          )}
          {allTags.length > 0 && (
            <Select
              allowClear
              placeholder={t('filterByTag')}
              style={{ width: 160 }}
              onChange={handleFilterTag}
              value={filterTagId}
              suffixIcon={<TagOutlined />}
            >
              {allTags.map(tag => (
                <Option key={tag.id} value={tag.id}>
                  <Space size={4}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: tag.color }} />
                    {tag.name}
                  </Space>
                </Option>
              ))}
            </Select>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={files}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: (p) => setPage(p),
            showTotal: (tot) => `${tot} ${t('total')}`,
          }}
          size="middle"
        />
      </Card>

      <Modal
        title={uploadFileId ? t('uploadNewVersion') : t('uploadFile')}
        open={uploadModal}
        onCancel={closeModal}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleUpload}>
          {uploadFileId && (
            <Form.Item label={t('fileName')}>
              <Input value={uploadFileName} readOnly />
            </Form.Item>
          )}
          <Form.Item label={t('selectFile')} required>
            <Dragger
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{t('uploadHint')}</p>
              <p className="ant-upload-hint">{t('uploadHint2')}</p>
            </Dragger>
          </Form.Item>

          {!uploadFileId && (
            <>
              <Form.Item label={t('selectLine')}>
                <Select
                  allowClear
                  placeholder={t('selectLine')}
                  onChange={(val) => { setUploadLineId(val || null); setUploadMachineId(null); }}
                  value={uploadLineId}
                >
                  {[
                    ...(folders.workshops || []).flatMap(w => w.lines || []),
                    ...(folders.lines || []),
                  ].map(l => <Option key={l.id} value={l.id}>{l.name}</Option>)}
                </Select>
              </Form.Item>

              {uploadLineId && (
                <Form.Item label={t('selectMachine')}>
                  <Select
                    allowClear
                    placeholder={t('selectMachine')}
                    onChange={(val) => setUploadMachineId(val || null)}
                    value={uploadMachineId}
                  >
                    {uploadMachines.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
                  </Select>
                </Form.Item>
              )}

              <Form.Item name="description" label={`${t('description')} ${t('optional')}`}>
                <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} />
              </Form.Item>
            </>
          )}

          <Form.Item name="commitMessage" label={`${t('commitMessage')} ${t('optional')}`}>
            <Input.TextArea rows={2} placeholder={t('commitMessagePlaceholder')} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={closeModal}>{t('cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={uploadLoading} icon={<UploadOutlined />}>
              {t('upload')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
