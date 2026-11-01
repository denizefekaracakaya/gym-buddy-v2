import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Model output is untrusted: markdown is converted to HTML and then sanitised
 * (the previous version injected unsanitised HTML, allowing script injection
 * through a crafted reply). Links, images and all attributes are dropped.
 */
export const renderSafeMarkdown = (text: string): string => {
    const html = marked.parse(text, { breaks: true, gfm: true, async: false }) as string;
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'],
        ALLOWED_ATTR: [],
    });
};
