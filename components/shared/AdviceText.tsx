import React from 'react';

/** Renders short AI advice text (plain text, one paragraph or bullet per line). No HTML is interpreted. */
const AdviceText: React.FC<{ text: string }> = ({ text }) => (
    <div className="text-slate-300 leading-relaxed space-y-2">
        {text
            .split('\n')
            .map((line) => line.trim().replace(/\*\*/g, ''))
            .filter(Boolean)
            .map((line, i) =>
                /^[-•*]\s+/.test(line) ? (
                    <p key={i} className="flex gap-2">
                        <span className="text-blue-400">•</span>
                        <span>{line.replace(/^[-•*]\s+/, '')}</span>
                    </p>
                ) : (
                    <p key={i}>{line}</p>
                ),
            )}
    </div>
);

export default AdviceText;
