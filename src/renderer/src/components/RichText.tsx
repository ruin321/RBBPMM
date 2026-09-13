import { useMemo } from 'react';
import type React from 'react';
const COLOR_HEX = /^#[0-9a-fA-F]{3,8}$/;
const COLOR_NAME = /^[a-zA-Z]+$/;
function normalizeRichText(src: string): string {
    let out = src;
    out = out.replace(/<color\s*=\s*([^>]+)>/gi, (_m, c: string) => {
        const v = c.trim().replace(/^["']+|["']+$/g, '');
        return `<span style="color:${v}">`;
    });
    out = out.replace(/<\/color>/gi, '</span>');
    out = out.replace(/<size\s*=\s*(\d+(?:\.\d+)?)>/gi, (_m, s: string) => `<span style="font-size:${s}px">`);
    out = out.replace(/<\/size>/gi, '</span>');
    return out;
}
function safeStyle(el: Element): React.CSSProperties | undefined {
    const raw = el.getAttribute('style');
    if (!raw)
        return undefined;
    const style: React.CSSProperties = {};
    for (const decl of raw.split(';')) {
        const idx = decl.indexOf(':');
        if (idx < 0)
            continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        let value = decl.slice(idx + 1).trim().replace(/^["']+|["']+$/g, '');
        if (!value)
            continue;
        if (prop === 'color' && (COLOR_HEX.test(value) || COLOR_NAME.test(value)))
            style.color = value;
        else if (prop === 'font-size' && /^\d+(?:\.\d+)?px$/.test(value))
            style.fontSize = value;
    }
    return Object.keys(style).length > 0 ? style : undefined;
}
function renderChildren(parent: Node): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let i = 0;
    parent.childNodes.forEach((child) => {
        out.push(renderNode(child, i));
        i += 1;
    });
    return out;
}
function renderNode(node: Node, key: number): React.ReactNode {
    if (node.nodeType === Node.TEXT_NODE)
        return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE)
        return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const kids = renderChildren(el);
    switch (tag) {
        case 'br':
            return <br key={key}/>;
        case 'b':
        case 'strong':
            return <strong key={key}>{kids}</strong>;
        case 'i':
        case 'em':
            return <em key={key}>{kids}</em>;
        case 'u':
            return <u key={key}>{kids}</u>;
        case 's':
        case 'del':
        case 'strike':
            return <s key={key}>{kids}</s>;
        case 'span':
            return (<span key={key} style={safeStyle(el)}>
          {kids}
        </span>);
        case 'p':
            return (<p key={key} className="my-1">
          {kids}
        </p>);
        case 'ul':
            return (<ul key={key} className="list-disc pl-5">
          {kids}
        </ul>);
        case 'ol':
            return (<ol key={key} className="list-decimal pl-5">
          {kids}
        </ol>);
        case 'li':
            return <li key={key}>{kids}</li>;
        case 'code':
            return <code key={key}>{kids}</code>;
        case 'pre':
            return (<pre key={key} className="whitespace-pre-wrap">
          {kids}
        </pre>);
        case 'blockquote':
            return (<blockquote key={key} className="border-l-2 border-muted pl-2">
          {kids}
        </blockquote>);
        default:
            return <span key={key}>{kids}</span>;
    }
}
export function RichText({ text, className }: {
    text?: string | null;
    className?: string;
}): React.JSX.Element | null {
    const content = useMemo(() => {
        if (!text)
            return null;
        const doc = new DOMParser().parseFromString(`<div id="__rt">${normalizeRichText(text)}</div>`, 'text/html');
        const root = doc.getElementById('__rt');
        if (!root)
            return null;
        return renderChildren(root);
    }, [text]);
    if (content === null)
        return null;
    return <span className={className}>{content}</span>;
}
