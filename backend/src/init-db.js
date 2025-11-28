import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

const dbName = process.env.DB_NAME || 'wyattxxxcole';

async function initDatabase() {
  console.log('Initializing MariaDB database...');

  // First connect without database to create it if needed
  const connection = await mysql.createConnection(dbConfig);

  try {
    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database '${dbName}' ready`);

    // Use the database (query instead of execute for USE statement)
    await connection.query(`USE \`${dbName}\``);

    // Create tables
    console.log('Creating tables...');

    // Admin users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Studio booking inquiries
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        shoot_type VARCHAR(100),
        location VARCHAR(255),
        dates VARCHAR(255),
        budget VARCHAR(100),
        details TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_bookings_status (status),
        INDEX idx_bookings_created (created_at)
      ) ENGINE=InnoDB
    `);

    // Creator collaboration requests
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS creator_collabs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        handle VARCHAR(255) NOT NULL,
        platform VARCHAR(100),
        email VARCHAR(255) NOT NULL,
        collab_type VARCHAR(100),
        location VARCHAR(255),
        links TEXT,
        details TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // General contact submissions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        message TEXT,
        form_type VARCHAR(50) DEFAULT 'general',
        status VARCHAR(50) DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Shop products
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        image_url VARCHAR(500),
        inventory_count INT DEFAULT 0,
        is_digital TINYINT(1) DEFAULT 0,
        digital_file_url VARCHAR(500),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_products_category (category),
        INDEX idx_products_active (is_active)
      ) ENGINE=InnoDB
    `);

    // Checkout sessions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        items JSON NOT NULL,
        shipping_address TEXT,
        billing_address TEXT,
        subtotal DECIMAL(10,2) NOT NULL,
        shipping_cost DECIMAL(10,2) DEFAULT 0,
        shipping_method VARCHAR(50) DEFAULT 'standard',
        tax_amount DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Shop orders
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        shipping_address TEXT,
        billing_address TEXT,
        items JSON NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        shipping DECIMAL(10,2) DEFAULT 0,
        shipping_method VARCHAR(50) DEFAULT 'standard',
        tax DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_intent_id VARCHAR(255),
        tracking_number VARCHAR(255),
        shipped_at TIMESTAMP NULL,
        delivered_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_status (status)
      ) ENGINE=InnoDB
    `);

    // Newsletter subscribers
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        source VARCHAR(50) DEFAULT 'shop',
        is_active TINYINT(1) DEFAULT 1,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at TIMESTAMP NULL
      ) ENGINE=InnoDB
    `);

    // Schedule availability
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schedule_availability (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_schedule_date (date)
      ) ENGINE=InnoDB
    `);

    // Upcoming locations/cities
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schedule_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        city VARCHAR(255) NOT NULL,
        start_date DATE,
        end_date DATE,
        tags TEXT,
        is_home_base TINYINT(1) DEFAULT 0,
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Location notification signups
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS location_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        is_notified TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_email_city (email, city)
      ) ENGINE=InnoDB
    `);

    // Community posts
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS community_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        media_url VARCHAR(500),
        media_type VARCHAR(50),
        tags VARCHAR(500),
        is_pinned TINYINT(1) DEFAULT 0,
        likes_count INT DEFAULT 0,
        comments_count INT DEFAULT 0,
        shares_count INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_posts_pinned (is_pinned),
        INDEX idx_posts_created (created_at)
      ) ENGINE=InnoDB
    `);

    // Community polls
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS community_polls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        question TEXT,
        options JSON NOT NULL,
        total_votes INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Poll votes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        poll_id INT NOT NULL,
        option_index INT NOT NULL,
        voter_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (poll_id) REFERENCES community_polls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_poll_voter (poll_id, voter_id)
      ) ENGINE=InnoDB
    `);

    // Post likes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        liker_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_post_liker (post_id, liker_id)
      ) ENGINE=InnoDB
    `);

    // Post comments
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_approved TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Portfolio items
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS portfolio_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        video_url VARCHAR(500),
        thumbnail_url VARCHAR(500),
        tags VARCHAR(500),
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_portfolio_category (category)
      ) ENGINE=InnoDB
    `);

    // Site settings
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_type VARCHAR(50) DEFAULT 'string',
        category VARCHAR(50) DEFAULT 'general',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Social links
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS social_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        icon VARCHAR(100),
        display_name VARCHAR(255),
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        category VARCHAR(50) DEFAULT 'social',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Integration settings
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS integrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider VARCHAR(100) UNIQUE NOT NULL,
        api_key VARCHAR(500),
        api_secret VARCHAR(500),
        additional_config JSON,
        is_enabled TINYINT(1) DEFAULT 0,
        last_tested TIMESTAMP NULL,
        test_status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // =============================================
    // WYATT WORLD TABLES
    // =============================================

    // Wyatt World users/members
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        avatar_url VARCHAR(500),
        bio TEXT,
        membership_tier VARCHAR(50) DEFAULT 'free',
        is_verified TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        last_seen TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_world_users_email (email)
      ) ENGINE=InnoDB
    `);

    // Wyatt World posts (feed)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        author_id INT,
        content TEXT NOT NULL,
        media_urls JSON,
        visibility VARCHAR(50) DEFAULT 'public',
        is_pinned TINYINT(1) DEFAULT 0,
        is_wyatt_post TINYINT(1) DEFAULT 0,
        likes_count INT DEFAULT 0,
        comments_count INT DEFAULT 0,
        reposts_count INT DEFAULT 0,
        ppv_price DECIMAL(10,2),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES world_users(id) ON DELETE SET NULL,
        INDEX idx_world_posts_author (author_id),
        INDEX idx_world_posts_created (created_at),
        INDEX idx_world_posts_visibility (visibility)
      ) ENGINE=InnoDB
    `);

    // World post likes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_post_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES world_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_post_user_like (post_id, user_id)
      ) ENGINE=InnoDB
    `);

    // World post comments
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_post_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        content TEXT NOT NULL,
        likes_count INT DEFAULT 0,
        is_approved TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES world_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // World post reposts
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_reposts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        quote TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES world_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_post_user_repost (post_id, user_id)
      ) ENGINE=InnoDB
    `);

    // World polls
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_polls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        question TEXT,
        options JSON NOT NULL,
        total_votes INT DEFAULT 0,
        ends_at TIMESTAMP NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES world_posts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // World poll votes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_poll_votes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        poll_id INT NOT NULL,
        user_id INT NOT NULL,
        option_index INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (poll_id) REFERENCES world_polls(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_poll_user_vote (poll_id, user_id)
      ) ENGINE=InnoDB
    `);

    // World conversations (DMs and group chats)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(20) DEFAULT 'dm',
        name VARCHAR(255),
        icon VARCHAR(255),
        is_vip_only TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES world_users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    // World direct messages
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id INT NOT NULL,
        content TEXT NOT NULL,
        media_url VARCHAR(500),
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES world_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES world_users(id) ON DELETE CASCADE,
        INDEX idx_world_messages_convo (conversation_id)
      ) ENGINE=InnoDB
    `);

    // World conversation participants
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_conversation_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        user_id INT NOT NULL,
        last_read_at TIMESTAMP NULL,
        is_admin TINYINT(1) DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES world_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_convo_user (conversation_id, user_id)
      ) ENGINE=InnoDB
    `);

    // World follows
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_follows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        follower_id INT NOT NULL,
        following_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (follower_id) REFERENCES world_users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES world_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_follow (follower_id, following_id)
      ) ENGINE=InnoDB
    `);

    // World memberships/subscriptions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tier VARCHAR(50) NOT NULL,
        price DECIMAL(10,2),
        stripe_subscription_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ends_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // World tips
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_tips (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        recipient_id INT,
        post_id INT,
        amount DECIMAL(10,2) NOT NULL,
        message TEXT,
        stripe_payment_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES world_users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES world_users(id) ON DELETE SET NULL,
        FOREIGN KEY (post_id) REFERENCES world_posts(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    // World notifications
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        message TEXT,
        link VARCHAR(500),
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES world_users(id) ON DELETE CASCADE,
        INDEX idx_world_notifications_user (user_id)
      ) ENGINE=InnoDB
    `);

    // World live streams
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_streams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        thumbnail_url VARCHAR(500),
        stream_url VARCHAR(500),
        replay_url VARCHAR(500),
        scheduled_at TIMESTAMP NULL,
        started_at TIMESTAMP NULL,
        ended_at TIMESTAMP NULL,
        duration INT,
        viewer_count INT DEFAULT 0,
        is_vip_only TINYINT(1) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // World podcast episodes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_podcast_episodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        episode_number INT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        audio_url VARCHAR(500),
        thumbnail_url VARCHAR(500),
        duration INT,
        is_vip_only TINYINT(1) DEFAULT 0,
        play_count INT DEFAULT 0,
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // World vault items (premium content)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS world_vault_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        media_type VARCHAR(50),
        media_url VARCHAR(500),
        thumbnail_url VARCHAR(500),
        duration INT,
        min_tier VARCHAR(50) DEFAULT 'vip',
        view_count INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    console.log('Tables created successfully!');

    // Seed default admin user
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    await connection.execute(`
      INSERT INTO admin_users (username, password_hash)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `, ['admin', hashedPassword]);
    console.log('Default admin user created (username: admin)');

    // Seed sample products
    const sampleProducts = [
      ['wxc-logo-tee', 'WXC Logo Tee - Black', 'Premium black cotton tee with neon WXC logo', 35, 'apparel', '/assets/products/tee.jpg', 100, 0],
      ['neon-rebel-hoodie', 'Neon Rebel Hoodie', 'Heavyweight hoodie with reflective neon accents', 65, 'apparel', '/assets/products/hoodie.jpg', 50, 0],
      ['cyberpunk-portrait', 'Cyberpunk Portrait Print', 'High-quality 11x14 art print on premium paper', 45, 'prints', '/assets/products/portrait.jpg', 30, 0],
      ['neon-wallpaper-pack', 'Neon Wallpaper Pack', '10 exclusive neon-themed digital wallpapers', 15, 'digital', '/assets/products/wallpapers.jpg', 999, 1],
      ['signed-8x10', 'Signed 8x10 Print', 'Hand-signed exclusive 8x10 photograph', 75, 'limited', '/assets/products/signed.jpg', 20, 0],
      ['wxc-snapback', 'WXC Snapback Cap', 'Adjustable snapback with embroidered logo', 30, 'apparel', '/assets/products/cap.jpg', 75, 0],
      ['neon-noir-poster', 'Neon Noir Poster', 'Large 24x36 poster featuring neon noir aesthetic', 25, 'prints', '/assets/products/poster.jpg', 40, 0],
      ['rebel-cut-tank', 'Rebel Cut Tank Top', 'Distressed tank with rebel cut styling', 28, 'apparel', '/assets/products/tank.jpg', 60, 0],
    ];

    for (const product of sampleProducts) {
      await connection.execute(`
        INSERT INTO products (slug, title, description, price, category, image_url, inventory_count, is_digital)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE title = VALUES(title)
      `, product);
    }
    console.log('Sample products seeded!');

    // Seed sample schedule locations
    const sampleLocations = [
      ['Los Angeles', null, null, 'Studio Shoots, Creator Collabs, Fan Meets', 1, 1],
      ['Las Vegas', '2025-02-15', '2025-02-20', 'Studio Shoots, Creator Collabs', 0, 2],
      ['Miami', '2025-03-05', '2025-03-12', 'Fan Meets, Studio Shoots', 0, 3],
      ['New York City', '2025-04-01', '2025-04-15', 'Creator Collabs', 0, 4],
      ['Chicago', '2025-05-01', '2025-05-10', 'TBD', 0, 5],
    ];

    for (const loc of sampleLocations) {
      await connection.execute(`
        INSERT INTO schedule_locations (city, start_date, end_date, tags, is_home_base, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE city = VALUES(city)
      `, loc);
    }
    console.log('Sample locations seeded!');

    // Seed sample community posts
    const samplePosts = [
      ['Welcome to the Neon Rebellion community! This is your space to connect, stay updated on shoots, and get exclusive behind-the-scenes content. Drop a comment and introduce yourself!', null, 'announcement,welcome', 1, 342, 89],
      ['Just wrapped an incredible shoot in LA. The neon aesthetics were next level. Full set dropping on my platforms this weekend. Who is ready?', '/assets/community/post1.jpg', 'bts,newscene,neon', 0, 156, 24],
      ['Tour planning for 2025! Vote for where you want to see me next:', null, 'tour,vote', 0, 89, 12],
      ['New merch alert! The Neon Rebel collection just dropped in the shop. Link in bio. Limited quantities available.', '/assets/community/merch.jpg', 'merch,newdrop', 0, 234, 45],
    ];

    for (const post of samplePosts) {
      await connection.execute(`
        INSERT INTO community_posts (content, media_url, tags, is_pinned, likes_count, comments_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `, post);
    }
    console.log('Sample posts seeded!');

    // Seed poll for tour voting post
    const pollOptions = JSON.stringify([
      { text: 'Las Vegas', votes: 375 },
      { text: 'Miami', votes: 276 },
      { text: 'New York', votes: 160 },
      { text: 'Chicago', votes: 81 }
    ]);
    await connection.execute(`
      INSERT INTO community_polls (post_id, question, options, total_votes)
      VALUES (3, 'Where should I tour next?', ?, 892)
    `, [pollOptions]);
    console.log('Sample poll seeded!');

    // Seed sample portfolio items
    const samplePortfolio = [
      ['photos', 'Neon Dreams', 'Studio shoot with neon lighting', '/assets/portfolio/photo1.jpg', null, 'cyberpunk,neon,studio', 1],
      ['photos', 'Chrome Reflection', 'Industrial chrome aesthetic', '/assets/portfolio/photo2.jpg', null, 'chrome,industrial,portrait', 2],
      ['photos', 'Leather Edge', 'Edgy leather shoot', '/assets/portfolio/photo3.jpg', null, 'leather,rugged,dark', 3],
      ['photos', 'Electric Blue', 'Blue neon portrait series', '/assets/portfolio/photo4.jpg', null, 'neon,portrait,editorial', 4],
      ['videos', 'Main Reel 2024', 'Professional showreel', '/assets/portfolio/reel-thumb.jpg', 'https://player.vimeo.com/video/123456', 'reel,professional', 1],
      ['videos', 'BTS Las Vegas', 'Behind the scenes footage', '/assets/portfolio/bts-thumb.jpg', 'https://player.vimeo.com/video/123457', 'bts,lasvegas', 2],
      ['themed', 'Neon Noir Collection', 'Dark neon aesthetic shoot', '/assets/portfolio/noir.jpg', null, 'neonnoir,collection', 1],
      ['themed', 'Chrome Rebel Series', 'Industrial chrome theme', '/assets/portfolio/chrome.jpg', null, 'chrome,rebel', 2],
      ['bts', 'On Set - LA Studio', 'Raw moments from LA shoot', '/assets/portfolio/bts1.jpg', null, 'bts,la,candid', 1],
      ['bts', 'Makeup & Prep', 'Getting ready for the shoot', '/assets/portfolio/bts2.jpg', null, 'bts,prep', 2],
    ];

    for (const item of samplePortfolio) {
      await connection.execute(`
        INSERT INTO portfolio_items (category, title, description, image_url, video_url, tags, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, item);
    }
    console.log('Sample portfolio items seeded!');

    // Seed availability dates
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const rand = Math.random();
      let status = 'available';
      if (rand > 0.9) status = 'off';
      else if (rand > 0.7) status = 'booked';

      await connection.execute(`
        INSERT INTO schedule_availability (date, status)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `, [dateStr, status]);
    }
    console.log('Sample availability seeded!');

    // Seed default site settings
    const defaultSettings = [
      ['site_name', 'WYATT XXX COLE', 'string', 'branding'],
      ['site_tagline', 'Country boy. Dirty mind. No apologies.', 'string', 'branding'],
      ['site_description', 'Gay masc redneck adult performer and content creator.', 'string', 'branding'],
      ['logo_text', 'WXXXC', 'string', 'branding'],
      ['hero_background_url', '', 'string', 'branding'],
      ['world_background_url', '', 'string', 'branding'],
      ['contact_email', 'contact@wyattxxxcole.xxx', 'string', 'contact'],
      ['booking_email', 'booking@wyattxxxcole.xxx', 'string', 'contact'],
      ['support_email', 'support@wyattxxxcole.xxx', 'string', 'contact'],
      ['bio_short', 'Just a horny Alabama boy who turned his dirty habits into a career. Gay. Masc. Redneck.', 'text', 'content'],
      ['bio_full', 'Alabama-bred, gay, masc, and built like the country boys your mama warned you about. Rough hands, dirty mouth, and the kind of intensity that leaves marks. Professional when the camera\'s rolling, feral when it ain\'t.', 'text', 'content'],
      ['base_city', 'Alabama', 'string', 'content'],
      ['free_shipping_us_threshold', '75', 'number', 'shop'],
      ['free_shipping_intl_threshold', '150', 'number', 'shop'],
      ['currency', 'USD', 'string', 'shop'],
      ['shop_enabled', 'true', 'boolean', 'features'],
      ['booking_enabled', 'true', 'boolean', 'features'],
      ['community_enabled', 'true', 'boolean', 'features'],
      ['schedule_public', 'true', 'boolean', 'features'],
      ['meta_title', 'Wyatt XXX Cole | Gay Masc Redneck Performer', 'string', 'seo'],
      ['meta_description', 'Country boy. Dirty mind. No apologies. Gay masc redneck adult performer.', 'text', 'seo'],
      ['meta_keywords', 'Wyatt XXX Cole, WXXXC, gay, masc, redneck, adult performer, content creator', 'string', 'seo'],
    ];

    for (const s of defaultSettings) {
      await connection.execute(`
        INSERT INTO site_settings (setting_key, setting_value, setting_type, category)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `, s);
    }
    console.log('Default site settings seeded!');

    // Seed social links
    const defaultSocialLinks = [
      ['boyfanz', '#', '&#9733;', 'BoyFanz', 1, 'content'],
      ['onlyfans', '#', '&#128293;', 'OnlyFans', 2, 'content'],
      ['pupfanz', '#', '&#9733;', 'PupFanz', 3, 'content'],
      ['twitter', '#', '&#120143;', 'X / Twitter', 1, 'social'],
      ['instagram', '#', '&#128247;', 'Instagram', 2, 'social'],
      ['tiktok', '#', '&#127925;', 'TikTok', 3, 'social'],
      ['threads', '#', '&#128172;', 'Threads', 4, 'social'],
      ['amazon_wishlist', '#', '&#128230;', 'Amazon Wishlist', 1, 'wishlist'],
      ['etsy_wishlist', '#', '&#127873;', 'Etsy Wishlist', 2, 'wishlist'],
    ];

    for (const link of defaultSocialLinks) {
      await connection.execute(`
        INSERT INTO social_links (platform, url, icon, display_name, sort_order, category)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE url = VALUES(url)
      `, link);
    }
    console.log('Default social links seeded!');

    // Seed integration placeholders
    const integrations = [
      'stripe', 'printful', 'printify', 'gelato', 'gooten', 'spod',
      'popcustoms', 'customink', 'prodigi', 'apliiq', 'dreamship', 'spring',
      'fourthwall', 'contrado', 'teelaunch', 'gearlaunch', 'pillowprofits',
      'mailchimp', 'sendgrid', 'google_analytics', 'facebook_pixel',
      'boyfanz', 'rentmen', 'podcast'
    ];

    for (const provider of integrations) {
      await connection.execute(`
        INSERT INTO integrations (provider, is_enabled)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE provider = VALUES(provider)
      `, [provider]);
    }
    console.log('Integration placeholders seeded!');

    console.log('\nDatabase initialization complete!');

  } finally {
    await connection.end();
  }
}

// Run initialization
initDatabase().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
