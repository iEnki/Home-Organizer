"""Storage xattr reconstruction: metadata/path regressions plus Linux-only I/O."""
import errno
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH=Path(__file__).resolve().parents[1]/'lib/storage_xattrs.py'
spec=importlib.util.spec_from_file_location('storage_xattrs',MODULE_PATH)
xattrs=importlib.util.module_from_spec(spec);spec.loader.exec_module(xattrs)

class StorageXattrTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='home-xattrs-')
        self.root=Path(self.temp.name)
        self.file=self.root/'local/local/docs/folder/file.pdf/version-1'
        self.file.parent.mkdir(parents=True);self.file.write_bytes(b'original-pdf')
        self.record={'bucket_id':'docs','name':'folder/file.pdf','version':'version-1','metadata':{'mimetype':'application/pdf','cacheControl':'no-cache'}}
        self.attrs={}
        self.get_patch=patch.object(xattrs.os,'getxattr',side_effect=self.get,create=True)
        self.set_patch=patch.object(xattrs.os,'setxattr',side_effect=self.set,create=True)
        self.get_mock=self.get_patch.start();self.set_mock=self.set_patch.start()

    def tearDown(self):
        self.get_patch.stop();self.set_patch.stop();self.temp.cleanup()

    def get(self,path,key,**kwargs):
        try:return self.attrs[(str(path),key)]
        except KeyError:raise OSError(errno.ENODATA,'missing attribute')

    def set(self,path,key,value,**kwargs):self.attrs[(str(path),key)]=value

    def test_legacy_attributes_reconstructed_exactly(self):
        self.assertEqual(xattrs.repair(self.root,[self.record]),2)
        self.assertEqual(self.get(self.file,'user.supabase.content-type'),b'application/pdf')
        self.assertEqual(self.get(self.file,'user.supabase.cache-control'),b'no-cache')
        self.assertEqual(self.file.read_bytes(),b'original-pdf')

    def test_archive_attributes_preserved(self):
        self.set(self.file,'user.supabase.content-type',b'archive/type')
        self.set(self.file,'user.supabase.cache-control',b'archive-cache')
        self.assertEqual(xattrs.repair(self.root,[self.record]),0)
        self.assertEqual(self.get(self.file,'user.supabase.content-type'),b'archive/type')
        self.set_mock.assert_not_called()

    def test_only_missing_attribute_is_reconstructed(self):
        self.set(self.file,'user.supabase.content-type',b'application/pdf')
        self.assertEqual(xattrs.repair(self.root,[self.record]),1)
        self.assertEqual(self.set_mock.call_count,1)

    def test_missing_metadata_is_not_guessed(self):
        self.record['metadata']=None
        with self.assertRaises(ValueError):xattrs.repair(self.root,[self.record])
        self.set_mock.assert_not_called()

    def test_missing_cache_control_is_not_guessed(self):
        self.set(self.file,'user.supabase.content-type',b'application/pdf')
        del self.record['metadata']['cacheControl']
        with self.assertRaises(ValueError):xattrs.repair(self.root,[self.record])
        self.set_mock.assert_not_called()

    def test_unsupported_filesystem_fails(self):
        self.get_mock.side_effect=OSError(errno.ENOTSUP,'unsupported')
        with self.assertRaises(OSError):xattrs.repair(self.root,[self.record])
        self.set_mock.assert_not_called()

    def test_missing_file_fails(self):
        self.file.unlink()
        with self.assertRaises(FileNotFoundError):xattrs.repair(self.root,[self.record])
        self.set_mock.assert_not_called()

    def test_path_escape_is_rejected(self):
        for field,value in [('bucket_id','..'),('bucket_id','../outside'),('name','../../outside'),('name','/outside'),('version','../outside')]:
            record=dict(self.record);record[field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):xattrs.repair(self.root,[record])
        self.set_mock.assert_not_called()

    def test_old_unversioned_file(self):
        self.record['version']=None
        self.record['name']='unversioned.pdf'
        file=self.root/'local/local/docs/unversioned.pdf';file.write_bytes(b'legacy')
        self.assertEqual(xattrs.repair(self.root,[self.record]),2)
        self.assertEqual(self.get(file,'user.supabase.content-type'),b'application/pdf')

    def test_configured_bucket_and_tenant_prefix(self):
        config=self.root/'backup.env'
        config.write_text('GLOBAL_S3_BUCKET="other-bucket"\nSTORAGE_TENANT_ID=other-tenant\n',encoding='utf-8')
        prefix=xattrs.backend_prefix(config)
        self.assertEqual(prefix,('other-bucket','other-tenant'))
        target=self.root/'other-bucket/other-tenant/docs/folder/file.pdf/version-1'
        target.parent.mkdir(parents=True);target.write_bytes(b'pdf')
        self.assertEqual(xattrs.repair(self.root,[self.record],prefix),2)
        self.assertEqual(self.get(target,'user.supabase.content-type'),b'application/pdf')

    def test_invalid_configured_prefix_is_rejected(self):
        config=self.root/'backup.env'
        config.write_text('GLOBAL_S3_BUCKET=../outside\n',encoding='utf-8')
        with self.assertRaises(ValueError):xattrs.backend_prefix(config)
        self.set_mock.assert_not_called()

    def test_invalid_metadata_container(self):
        with self.assertRaises(ValueError):xattrs.repair(self.root,{'objects':[]})
        self.set_mock.assert_not_called()

    def test_attribute_write_is_verified(self):
        self.set_mock.side_effect=lambda *args,**kwargs:None
        with self.assertRaises(OSError):xattrs.repair(self.root,[self.record])

    def test_empty_storage_needs_no_reconstruction(self):
        self.assertEqual(xattrs.repair(self.root,[]),0)
        self.set_mock.assert_not_called()


@unittest.skipUnless(sys.platform=='linux' and hasattr(os,'setxattr'),'Real xattr I/O requires Linux; HOME-10 must verify this on CT 910')
class LinuxStorageXattrTests(unittest.TestCase):
    def test_real_tar_roundtrip_and_legacy_repair(self):
        with tempfile.TemporaryDirectory(prefix='home-xattr-linux-') as tmp:
            root=Path(tmp)
            try:xattrs.probe(root)
            except OSError as error:
                if error.errno in (errno.ENOTSUP,errno.EPERM):self.skipTest('Filesystem does not support user xattrs')
                raise
            file=root/'source/storage/local/local/docs/a.pdf/v1';file.parent.mkdir(parents=True);file.write_bytes(b'pdf-data')
            os.setxattr(file,'user.supabase.content-type',b'application/pdf')
            os.setxattr(file,'user.supabase.cache-control',b'no-cache')
            subprocess.run(['tar','--xattrs',"--xattrs-include=user.*",'-czf',str(root/'modern.tar.gz'),'-C',str(root/'source'),'storage'],check=True)
            destination=root/'modern';destination.mkdir()
            subprocess.run(['tar','--xattrs',"--xattrs-include=user.*",'-xzf',str(root/'modern.tar.gz'),'-C',str(destination)],check=True)
            restored=destination/'storage/local/local/docs/a.pdf/v1'
            self.assertEqual(os.getxattr(restored,'user.supabase.content-type'),b'application/pdf')
            self.assertEqual(os.getxattr(restored,'user.supabase.cache-control'),b'no-cache')
            # An archive without attrs must be repaired using authoritative DB values.
            subprocess.run(['tar','-czf',str(root/'legacy.tar.gz'),'-C',str(root/'source'),'storage'],check=True)
            legacy=root/'legacy';legacy.mkdir()
            subprocess.run(['tar','-xzf',str(root/'legacy.tar.gz'),'-C',str(legacy)],check=True)
            records=[{'bucket_id':'docs','name':'a.pdf','version':'v1','metadata':{'mimetype':'application/pdf','cacheControl':'no-cache'}}]
            self.assertEqual(xattrs.repair(legacy/'storage',records),2)
            self.assertEqual((legacy/'storage/local/local/docs/a.pdf/v1').read_bytes(),b'pdf-data')

if __name__=='__main__':unittest.main()
