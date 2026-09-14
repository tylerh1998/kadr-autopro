const fs = require('fs');

const file = 'src/components/work-orders/WorkPROViewModal.jsx';
let content = fs.readFileSync(file, 'utf8');

const imports = `
import { uploadProjectPhoto, fetchProjectPhotos, getSignedProjectPhotoUrl, deleteProjectPhoto } from "@/lib/projectPhotos";
import heic2any from "heic2any";
import MediaViewerModal from "../sms/MediaViewerModal";
`;

if (!content.includes('fetchProjectPhotos')) {
  // wait it does contain fetchProjectPhotos in the body.
}

if (!content.includes('from "@/lib/projectPhotos"')) {
  content = content.replace("import { supabase } from '@/lib/supabase';", "import { supabase } from '@/lib/supabase';\n" + imports);
  fs.writeFileSync(file, content);
  console.log("Added imports");
}
