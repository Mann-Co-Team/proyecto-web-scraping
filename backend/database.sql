-- Crear base de datos si no existe
CREATE DATABASE IF NOT EXISTS web_scraper_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE web_scraper_db;

-- Nota: ejecuta este script completo en tu instancia local para recrear las tablas antes de correr migraciones adicionales.

-- Eliminar tablas si ya existen
DROP TABLE IF EXISTS listing_attributes;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS scrape_run_pages;
DROP TABLE IF EXISTS scrape_runs;
DROP TABLE IF EXISTS scraping_results;
DROP TABLE IF EXISTS scraping_jobs;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS users;


-- Tabla de Usuarios
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NULL,
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

-- Tabla de ejecuciones de scraping (runs) para soportar scraping multipágina y reusabilidad
CREATE TABLE scrape_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    region VARCHAR(40) NOT NULL,
    category VARCHAR(40) NOT NULL,
    search_term VARCHAR(255) NULL,
    query_hash CHAR(40) NOT NULL,
    max_pages INT NOT NULL,
    status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_query_hash (query_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla que representa cada página encolada/procesada dentro de un run
CREATE TABLE scrape_run_pages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    page_number INT NOT NULL,
    status ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
    error TEXT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    fetched_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY run_page (run_id, page_number),
    CONSTRAINT fk_run_pages_run FOREIGN KEY (run_id)
        REFERENCES scrape_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla central con cada aviso individual normalizado
CREATE TABLE listings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    page_number INT NOT NULL,
    external_id VARCHAR(255) NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    price_numeric BIGINT NULL,
    price_label VARCHAR(255) NULL,
    location VARCHAR(255) NULL,
    seller VARCHAR(255) NULL,
    property_type VARCHAR(40) NULL,
    bedroom_count TINYINT NULL,
    transaction_type ENUM('rent','sale','unknown') NOT NULL DEFAULT 'unknown',
    link TEXT NULL,
    image TEXT NULL,
    raw JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_listings_run FOREIGN KEY (run_id)
        REFERENCES scrape_runs(id) ON DELETE CASCADE,
    KEY idx_run_transaction_price (run_id, transaction_type, price_numeric),
    KEY idx_run_property (run_id, property_type),
    KEY idx_run_bedrooms (run_id, bedroom_count),
    KEY idx_run_location (run_id, location(120)),
    FULLTEXT KEY idx_listings_search (title, description),
    UNIQUE KEY idx_external_listing (run_id, external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla auxiliar para atributos dinámicos (ej: m², dormitorios) de cada aviso
CREATE TABLE listing_attributes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    listing_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(100) NOT NULL,
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_listing_attributes_listing FOREIGN KEY (listing_id)
        REFERENCES listings(id) ON DELETE CASCADE,
    KEY idx_label_value (label, value(120))
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