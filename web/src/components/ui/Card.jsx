import React from 'react';
import './Card.css';

const Card = ({
  children,
  className = '',
  padding = true,
  hoverable = false,
  onClick,
  ...props
}) => {
  const cardClass = [
    'card',
    padding ? 'card-padding' : '',
    hoverable ? 'card-hoverable' : '',
    onClick ? 'card-clickable' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} onClick={onClick} {...props}>
      {children}
    </div>
  );
};

// Card Header Component
Card.Header = ({ children, className = '' }) => (
  <div className={`card-header ${className}`}>{children}</div>
);

// Card Body Component
Card.Body = ({ children, className = '' }) => (
  <div className={`card-body ${className}`}>{children}</div>
);

// Card Footer Component
Card.Footer = ({ children, className = '' }) => (
  <div className={`card-footer ${className}`}>{children}</div>
);

export default Card;
