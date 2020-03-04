// Agoric Dapp api deployment script

export default async function deployApi(homeP, { bundleSource, pathResolve }) {
  const { source, moduleFormat } = await bundleSource(pathResolve('./handler.js'));
  const handlerInstall = homeP~.spawner~.install(source, moduleFormat);
  const [zoe, registrar] = await Promise.all([homeP~.zoe, homeP~.registrar]);
  const handler = handlerInstall~.spawn({zoe, registrar});
  await homeP~.http~.registerCommandHandler(handler);
}
