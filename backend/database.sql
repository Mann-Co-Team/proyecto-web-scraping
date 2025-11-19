-- Crear base de datos si no existe
CREATE DATABASE IF NOT EXISTS web_scraper_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE web_scraper_db;

-- Eliminar tablas si ya existen
DROP TABLE IF EXISTS scraping_results;
DROP TABLE IF EXISTS scraping_jobs;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS users;


-- Tabla de Usuarios
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla de Trabajos de Scraping
CREATE TABLE scraping_jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    target_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_jobs_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla de Resultados de Scraping
CREATE TABLE scraping_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    job_reference VARCHAR(255) NULL,
    data JSON NOT NULL,
    error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla para gestionar tokens de recuperación de contraseña
CREATE TABLE password_resets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Trigger para actualizar el campo updated_at en la tabla users

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW

SET NEW.updated_at = CURRENT_TIMESTAMP;