"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

export function DangerZone({ configured, confirmOpen, clearing, onOpen, onCancel, onConfirm }: { configured: boolean; confirmOpen: boolean; clearing: boolean; onOpen: () => void; onCancel: () => void; onConfirm: () => void }) {
  return <section className="danger-zone" aria-labelledby="danger-title"><div><h2 id="danger-title">危险操作</h2><p>{configured ? "清空后需重新填写密钥才能继续使用此接口。" : "当前已无密钥。"}</p></div><Button variant="danger" type="button" onClick={onOpen} disabled={!configured}><Icon name="trash" />清空 API 密钥</Button><Modal open={confirmOpen} title="确认清空 API 密钥？" onClose={onCancel}><div className="danger-modal-icon"><Icon name="trash" /></div><p>清空后，本设备将无法继续使用该 AI 接口生成内容，除非重新填写密钥。</p><strong>此操作不可撤销。</strong><div className="modal-actions"><Button variant="ghost" type="button" onClick={onCancel}>取消</Button><Button variant="danger" type="button" disabled={clearing} onClick={onConfirm}>{clearing ? "正在清空…" : "确认清空"}</Button></div></Modal></section>;
}
