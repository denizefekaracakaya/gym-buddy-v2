import React from 'react';

// By extending React.HTMLAttributes<HTMLDivElement>, Card can accept standard div props like onClick
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
    return (
        <div {...props} className={`bg-slate-900 rounded-xl shadow-lg p-6 ${className}`}>
            {children}
        </div>
    );
};

export default Card;
