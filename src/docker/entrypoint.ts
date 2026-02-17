export interface EntrypointOptions {
	plugins: string[];
	adminUser: string;
	adminEmail: string;
	locale: string;
}

export function generateEntrypoint(opts?: EntrypointOptions): string {
	const plugins = opts?.plugins ?? ["all-in-one-wp-migration"];
	const adminUser = opts?.adminUser ?? "admin";
	const adminEmail = opts?.adminEmail ?? "admin@local.test";
	const locale = opts?.locale ?? "de_DE";

	const isGerman = locale.startsWith("de");

	const pluginInstalls = plugins
		.map(
			(p) =>
				`    echo "Installing ${p}..."\n    wp plugin install ${p} --activate --allow-root`,
		)
		.join("\n");

	const localeSettings = isGerman
		? `    wp option update timezone_string "Europe/Berlin" --allow-root
    wp option update date_format "d.m.Y" --allow-root
    wp option update time_format "H:i" --allow-root
    wp option update start_of_week 1 --allow-root`
		: `    wp option update timezone_string "UTC" --allow-root
    wp option update date_format "F j, Y" --allow-root
    wp option update time_format "g:i a" --allow-root
    wp option update start_of_week 1 --allow-root`;

	return `#!/bin/bash
set -e

# Remap www-data UID to match host user — eliminates all ACL/permission issues
if [ -n "$HOST_UID" ] && [ "$HOST_UID" != "0" ]; then
    sed -i "s/^www-data:x:[0-9]*:/www-data:x:\${HOST_UID}:/" /etc/passwd
fi

wait_for_mysql() {
    echo "Waiting for MySQL..."
    local max_tries=60
    local tries=0
    while [ $tries -lt $max_tries ]; do
        if (echo > /dev/tcp/db/3306) 2>/dev/null; then
            echo "MySQL is ready."
            sleep 3
            return 0
        fi
        tries=$((tries + 1))
        sleep 2
    done
    echo "Warning: MySQL not ready after $max_tries attempts"
    return 1
}

cd /var/www/html

# Download WordPress core if not present
if [ ! -f /var/www/html/wp-includes/version.php ]; then
    echo "Downloading WordPress..."
    wp core download --locale="\${WP_LOCALE:-${locale}}" --allow-root
fi

wait_for_mysql

# Create wp-config.php if missing
if [ ! -f /var/www/html/wp-config.php ]; then
    echo "Creating wp-config.php..."
    wp config create \\
        --dbname="\${WORDPRESS_DB_NAME:-wordpress}" \\
        --dbuser="\${WORDPRESS_DB_USER:-wordpress}" \\
        --dbpass="\${WORDPRESS_DB_PASSWORD:-wordpress}" \\
        --dbhost="\${WORDPRESS_DB_HOST:-db}" \\
        --locale="\${WP_LOCALE:-${locale}}" \\
        --allow-root
fi

# Install WordPress if not installed
if ! wp core is-installed --allow-root 2>/dev/null; then
    echo "Installing WordPress..."
    wp core install \\
        --url="http://localhost:\${WP_PORT:-8080}" \\
        --title="\${WP_SITE_NAME:-WordPress Dev}" \\
        --admin_user=${adminUser} \\
        --admin_password=admin \\
        --admin_email=${adminEmail} \\
        --locale="\${WP_LOCALE:-${locale}}" \\
        --allow-root

    echo "Cleaning up defaults..."
    wp post delete 1 2 --force --allow-root 2>/dev/null || true
    wp comment delete 1 --force --allow-root 2>/dev/null || true
    wp plugin delete hello akismet --allow-root 2>/dev/null || true
    wp theme delete twentytwentythree twentytwentyfour --allow-root 2>/dev/null || true

${pluginInstalls ? `    echo "Installing plugins..."\n${pluginInstalls}` : ""}

    echo "Configuring settings..."
${localeSettings}

    # Configure Mailpit as SMTP
    wp config set WPDEV_SMTP_HOST mailpit --allow-root
    wp config set WPDEV_SMTP_PORT 1025 --raw --allow-root

    echo "WordPress setup complete!"
    echo "========================================"
    echo "Login: ${adminUser} / admin"
    echo "URL: http://localhost:\${WP_PORT:-8080}"
    echo "========================================"
else
    echo "WordPress already installed."
fi

# Fix permissions (www-data is now remapped to HOST_UID, so host user owns all files)
chown -R www-data:www-data /var/www/html

exec "$@"
`;
}
