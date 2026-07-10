export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export function getWorkOrderEditUrl(roNumber: string | number) {
    return `/WorkOrderEdit?id=${roNumber}`;
}