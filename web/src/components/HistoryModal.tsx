import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import type { MoveSummary } from '@hooks/useSantorini';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: MoveSummary[];
  jumpToMove: (index: number) => Promise<void>;
}

function HistoryModal({ isOpen, onClose, history, jumpToMove }: HistoryModalProps) {
  const handleJump = async (index: number) => {
    await jumpToMove(index);
    onClose();
  };

  const modalBg = useColorModeValue('white', 'gray.800');
  const modalTextColor = useColorModeValue('gray.900', 'white');
  const buttonBg = useColorModeValue('gray.50', 'gray.700');
  const buttonHoverBg = useColorModeValue('gray.100', 'gray.600');
  const buttonBorderColor = useColorModeValue('gray.200', 'gray.600');
  const secondaryTextColor = useColorModeValue('gray.600', 'gray.400');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent bg={modalBg} color={modalTextColor}>
        <ModalHeader>Game history</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3} maxH="400px" overflowY="auto">
            {history.length === 0 && <Text color={secondaryTextColor}>No moves recorded yet.</Text>}
            {history.map((move, index) => (
              <Button
                key={`${move.action ?? 'start'}-${index}`}
                justifyContent="space-between"
                variant="ghost"
                borderWidth="1px"
                borderColor={buttonBorderColor}
                bg={buttonBg}
                _hover={{ bg: buttonHoverBg }}
                onClick={() => handleJump(index)}
                h="auto"
                py={3}
                px={4}
              >
                <Text fontWeight="semibold" color={modalTextColor}>
                  {move.description || `Move ${index + 1}`}
                </Text>
                <Text fontSize="sm" color={secondaryTextColor}>
                  Player {move.player}
                </Text>
              </Button>
            ))}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" mr={3} onClick={() => handleJump(0)} isDisabled={history.length === 0}>
            Go to start
          </Button>
          <Button
            colorScheme="teal"
            onClick={() => handleJump(history.length - 1)}
            isDisabled={history.length === 0}
          >
            Go to end
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default HistoryModal;
