import React from 'react';
import './Input.css';

const Input = ({
  label,
  type = 'text',
  name,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}) => {
  return (
    <div className={`input-wrapper ${className}`}>
      {label && (
        <label htmlFor={name} className="input-label">
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}
      
      <div className="input-container">
        {leftIcon && <span className="input-icon-left">{leftIcon}</span>}
        
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`input ${error ? 'input-error' : ''} ${leftIcon ? 'input-with-left-icon' : ''} ${rightIcon ? 'input-with-right-icon' : ''}`}
          {...props}
        />
        
        {rightIcon && <span className="input-icon-right">{rightIcon}</span>}
      </div>
      
      {error && <span className="input-error-message">{error}</span>}
    </div>
  );
};

export default Input;
