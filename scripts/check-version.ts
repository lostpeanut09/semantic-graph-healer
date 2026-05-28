import fs from 'node:fs';
import path from 'node:path';

interface PackageJson {
    version: string;
}

interface Lockfile {
    version: string;
    packages?: {
        '': { version?: string };
        [key: string]: { version?: string } | undefined;
    };
}

interface Manifest {
    version: string;
    minAppVersion: string;
}

type VersionsJson = Record<string, string>;

/**
 * Robust version consistency check for Obsidian plugins.
 * Verifies synchronization between:
 * - package.json
 * - package-lock.json
 * - manifest.json
 * - versions.json
 */

function logError(message: string) {
    console.error(`\x1b[31m[Version Check Error]\x1b[0m ${message}`);
}

function checkVersions() {
    const root = process.env.CHECK_VERSION_ROOT || process.argv[2] || process.cwd();

    const paths = {
        package: path.join(root, 'package.json'),
        lock: path.join(root, 'package-lock.json'),
        manifest: path.join(root, 'manifest.json'),
        versions: path.join(root, 'versions.json'),
    };

    // Check if files exist
    for (const [name, filePath] of Object.entries(paths)) {
        if (!fs.existsSync(filePath)) {
            logError(`Missing ${name} file at: ${filePath}`);
            process.exit(1);
        }
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(paths.package, 'utf-8')) as unknown as PackageJson;
        const lock = JSON.parse(fs.readFileSync(paths.lock, 'utf-8')) as unknown as Lockfile;
        const manifest = JSON.parse(fs.readFileSync(paths.manifest, 'utf-8')) as unknown as Manifest;
        const versions = JSON.parse(fs.readFileSync(paths.versions, 'utf-8')) as unknown as VersionsJson;

        let hasError = false;

        const pkgVersion = pkg.version;
        const lockVersion = lock.version;
        const manifestVersion = manifest.version;
        const manifestMinAppVersion = manifest.minAppVersion;

        // 1. Verify manifest.json version === package.json version
        if (manifestVersion !== pkgVersion) {
            logError(`manifest.json version (${manifestVersion}) != package.json version (${pkgVersion})`);
            hasError = true;
        }

        // 2. Verify package-lock.json version === package.json version
        if (lockVersion !== pkgVersion) {
            logError(`package-lock.json version (${lockVersion}) != package.json version (${pkgVersion})`);
            hasError = true;
        }
        if (lock.packages && lock.packages[''] && lock.packages[''].version !== pkgVersion) {
            logError(
                `package-lock.json packages[""].version (${lock.packages[''].version}) != package.json version (${pkgVersion})`,
            );
            hasError = true;
        }

        // 3. Verify versions.json[package.json.version] exists
        if (!(pkgVersion in versions)) {
            logError(`package.json version (${pkgVersion}) is missing from versions.json`);
            hasError = true;
        } else {
            // 4. Verify versions.json[package.json.version] === manifest.json.minAppVersion
            const versionsMinAppVersion = versions[pkgVersion];
            if (versionsMinAppVersion !== manifestMinAppVersion) {
                logError(
                    `versions.json entry for ${pkgVersion} (${versionsMinAppVersion}) != manifest.json minAppVersion (${manifestMinAppVersion})`,
                );
                hasError = true;
            }
        }

        if (hasError) {
            process.exit(1);
        }

        console.log('\x1b[32m[Version Check Passed]\x1b[0m All version files are synchronized.');
        process.exit(0);
    } catch (error) {
        logError(`Failed to parse JSON files: ${(error as Error).message}`);
        process.exit(1);
    }
}

checkVersions();
