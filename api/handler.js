import harden from '@agoric/harden';

export default harden((_terms, _inviteMaker) => {
  return harden({
    getCommandHandler() {
      return harden({
        processInbound(obj, _home) {
          switch (obj.type) {
            case 'dapp-autoswapMessage': {
              return harden({ type: 'dapp-autoswapResponse', orig: obj });
            }
            default:
              return undefined;
          }
        },
      });
    },
  });
});
