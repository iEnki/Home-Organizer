"""Preserve/reconstruct Supabase file-backend xattrs. Python stdlib only."""
import argparse
import errno
import json
import os
from pathlib import Path, PurePosixPath
import tempfile

ATTRIBUTES = {
    'user.supabase.content-type': 'mimetype',
    'user.supabase.cache-control': 'cacheControl',
}
MISSING = {errno.ENODATA, getattr(errno, 'ENOATTR', errno.ENODATA)}


def probe(directory):
    if not all(hasattr(os, name) for name in ('setxattr', 'getxattr')):
        raise RuntimeError('Linux extended file attributes are required for storage backups.')
    with tempfile.NamedTemporaryFile(prefix='.umzug-xattr-probe-', dir=directory) as temporary:
        os.setxattr(temporary.fileno(), 'user.supabase.backup-probe', b'ok')
        if os.getxattr(temporary.fileno(), 'user.supabase.backup-probe') != b'ok':
            raise RuntimeError('Storage filesystem does not preserve user xattrs.')


def backend_prefix(config):
    values = {'GLOBAL_S3_BUCKET': 'local', 'STORAGE_TENANT_ID': 'local'}
    if config and Path(config).is_file():
        for line in Path(config).read_text(encoding='utf-8').splitlines():
            key, separator, value = line.partition('=')
            if separator and key.strip() in values:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]
                values[key.strip()] = value
    prefix = (values['GLOBAL_S3_BUCKET'], values['STORAGE_TENANT_ID'])
    if any(not value or '/' in value or value in ('.', '..') for value in prefix):
        raise ValueError('Invalid configured storage backend prefix.')
    return prefix


def object_path(root, record, prefix=('local', 'local')):
    # The current single-tenant file backend stores tenant/bucket/name/version.
    bucket = record['bucket_id']
    name = record['name']
    version = record.get('version')
    if not isinstance(bucket, str) or not bucket or '/' in bucket or bucket in ('.', '..'):
        raise ValueError('Invalid storage bucket path.')
    if not isinstance(name, str) or not name or name.startswith('/') or '..' in name.split('/'):
        raise ValueError('Invalid storage object path.')
    if version is not None and (not isinstance(version, str) or not version or '/' in version or version in ('.', '..')):
        raise ValueError('Invalid storage version path.')
    parts = (*prefix, bucket, *PurePosixPath(name).parts)
    path = root.joinpath(*parts)
    if version is not None:
        path = path / version
    # Reject links in every component, including any escaping the storage root.
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Storage object path contains a symlink.')
    path.resolve(strict=True).relative_to(root.resolve(strict=True))
    if not path.is_file():
        raise ValueError('Storage object has no matching regular file.')
    return path


def repair(directory, records, prefix=('local', 'local')):
    root = Path(directory).absolute()
    if not isinstance(records, list):
        raise ValueError('Storage metadata must be a JSON array.')
    repaired = 0
    for record in records:
        if not isinstance(record, dict):
            raise ValueError('Invalid storage metadata row.')
        path = object_path(root, record, prefix)
        metadata = record.get('metadata')
        for attribute, field in ATTRIBUTES.items():
            try:
                os.getxattr(path, attribute, follow_symlinks=False)
                continue  # Preserve attributes from a modern archive exactly.
            except OSError as error:
                if error.errno not in MISSING:
                    raise
            value = metadata.get(field) if isinstance(metadata, dict) else None
            if not isinstance(value, str) or not value or '\x00' in value:
                raise ValueError('Cannot reconstruct missing storage xattr from metadata.')
            encoded = value.encode('utf-8')
            os.setxattr(path, attribute, encoded, follow_symlinks=False)
            if os.getxattr(path, attribute, follow_symlinks=False) != encoded:
                raise RuntimeError('Storage xattr verification failed.')
            repaired += 1
    return repaired


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['probe', 'repair'])
    parser.add_argument('directory')
    parser.add_argument('metadata', nargs='?')
    parser.add_argument('--config', help='Backup configuration defining the storage prefix')
    args = parser.parse_args()
    if args.mode == 'probe':
        probe(args.directory)
    else:
        if not args.metadata:
            parser.error('repair requires a metadata JSON file')
        with open(args.metadata, encoding='utf-8') as source:
            count = repair(args.directory, json.load(source), backend_prefix(args.config))
        print(f'Storage attributes reconstructed: {count}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        # Do not print metadata, SQL contents or private object paths.
        raise SystemExit(f'Storage attribute validation failed ({type(error).__name__}).')
