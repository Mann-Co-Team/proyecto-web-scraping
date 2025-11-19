import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const NotificationContext = createContext();
const DEFAULT_DURATION = 4000;

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const notification = {
      id,
      message,
      type: options.type || 'info',
      duration: options.duration || DEFAULT_DURATION,
    };

    setNotifications((prev) => [...prev, notification]);
    setTimeout(() => removeNotification(id), notification.duration);
    return id;
  }, [removeNotification]);

  const value = useMemo(
    () => ({ notify, removeNotification }),
    [notify, removeNotification]
  );

  const toastStack = (
    <div className="toast-stack" role="status" aria-live="polite">
      {notifications.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' ? createPortal(toastStack, document.body) : toastStack}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  }
  return context;
};
